import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { rideOfferStatus, rideRequestStatus } from "./schema";
import { holdRidePayment, settleRideCancellation } from "./rides";

const offerStatus = rideOfferStatus;
const requestStatus = rideRequestStatus;
async function currentUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in required");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Account profile not found");
  return user;
}

async function hasActiveRide(ctx: any, user: any, exceptRideId?: any) {
  if (user.activeRideId && user.activeRideId !== exceptRideId) return true;
  const rides = await ctx.db
    .query("rides")
    .withIndex(user.role === "rider" ? "by_rider" : "by_user", (q: any) =>
      q.eq(user.role === "rider" ? "riderId" : "userId", user._id),
    )
    .order("desc")
    .take(50);
  return rides.some((ride: any) =>
    ride._id !== exceptRideId &&
    ["accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(ride.status),
  );
}

async function notify(ctx: any, args: {
  userId: any;
  type: "ride_request" | "ride_offer" | "offer_accepted" | "offer_closed" | "ride_cancelled" | "ride_expired" | "payment_confirmed" | "ride_status";
  title: string;
  body: string;
  rideId?: any;
  offerId?: any;
  destination: string;
}) {
  await ctx.db.insert("notifications", { ...args, createdAt: Date.now() });
}

async function submitRideOfferHandler(ctx: any, args: { rideId: any; fare: number }) {
    const rider = await currentUser(ctx);
    if (rider.role !== "rider") throw new Error("Rider access required");
    if (rider.verificationStatus !== "approved") throw new Error("Account Verification Required");
    if (rider.isOnline !== true) throw new Error("Go online before submitting a price offer");
    if (!Number.isSafeInteger(args.fare) || !Number.isSafeInteger(args.fare * 100) || args.fare < 250) {
      throw new Error("Enter a whole-number fare of at least ₦250");
    }
    if (await hasActiveRide(ctx, rider)) {
      throw new Error("Complete your current ride before submitting another offer");
    }

    const ride = await ctx.db.get(args.rideId);
    if (!ride || !["requested", "negotiating"].includes(ride.status) || ride.riderId !== undefined ||
      (ride.requestStatus !== "searching" && ride.requestStatus !== "offers_available")) {
      throw new Error("This ride request is no longer accepting offers");
    }
    if ((ride.expiresAt ?? ride.requestedAt + 10 * 60 * 1000) <= Date.now()) {
      throw new Error("This ride request has expired");
    }
    const existing = await ctx.db.query("rideOffers")
      .withIndex("by_ride_rider", (q: any) => q.eq("rideId", ride._id).eq("riderId", rider._id))
      .unique();
    if (existing) throw new Error("You have already submitted an offer for this request");

    const createdAt = Date.now();
    const offerId = await ctx.db.insert("rideOffers", {
      rideId: ride._id,
      riderId: rider._id,
      fare: args.fare,
      currency: "NGN",
      status: "submitted",
      createdAt,
    });
    await ctx.db.patch(ride._id, { status: "negotiating", requestStatus: "offers_available" });
    await notify(ctx, {
      userId: ride.userId,
      type: "ride_offer",
      title: "A rider has offered a price",
      body: `${rider.name ?? "An A9 rider"} offered ₦${args.fare.toLocaleString("en-NG")} for your trip. Tap to review.`,
      rideId: ride._id,
      offerId,
      destination: "dashboard",
    });
    return offerId;
}

export const submitRideOffer = mutation({
  args: { rideId: v.id("rides"), fare: v.number() },
  returns: v.id("rideOffers"),
  handler: submitRideOfferHandler,
});

export const submitRiderOffer = mutation({
  args: { rideId: v.id("rides"), proposedPrice: v.number() },
  returns: v.id("rideOffers"),
  handler: (ctx, args) =>
    submitRideOfferHandler(ctx, { rideId: args.rideId, fare: args.proposedPrice }),
});

export const listRideOffers = query({
  args: { rideId: v.id("rides") },
  returns: v.array(v.object({
    _id: v.id("rideOffers"),
    rideId: v.id("rides"),
    riderId: v.id("users"),
    fare: v.number(),
    currency: v.literal("NGN"),
    status: offerStatus,
    createdAt: v.number(),
    riderName: v.optional(v.string()),
    vehicle: v.optional(v.string()),
    averageRating: v.number(),
    ratingCount: v.number(),
    riderOnline: v.boolean(),
  })),
  handler: async (ctx, args) => {
    const customer = await currentUser(ctx);
    if (customer.role !== "student") throw new Error("Customer access required");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== customer._id) throw new Error("Ride access denied");
    const offers = await ctx.db.query("rideOffers")
      .withIndex("by_ride", (q: any) => q.eq("rideId", ride._id))
      .order("asc")
      .take(100);
    return Promise.all(offers.map(async (offer: any) => {
      const rider: any = await ctx.db.get(offer.riderId);
      return {
        _id: offer._id,
        rideId: offer.rideId,
        riderId: offer.riderId,
        fare: offer.fare,
        currency: offer.currency,
        status: offer.status,
        createdAt: offer.createdAt,
        riderName: rider?.name,
        vehicle: rider?.vehicle,
        averageRating: rider?.ratingCount ? Math.round((rider.ratingTotal ?? 0) / rider.ratingCount * 10) / 10 : 0,
        ratingCount: rider?.ratingCount ?? 0,
        riderOnline: rider?.isOnline === true && rider?.verificationStatus === "approved",
      };
    }));
  },
});

export const listMyRideOffers = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("rideOffers"),
    rideId: v.id("rides"),
    fare: v.number(),
    status: offerStatus,
    createdAt: v.number(),
    pickupLabel: v.optional(v.string()),
    destinationLabel: v.optional(v.string()),
    expiresAt: v.number(),
    requestStatus: v.optional(requestStatus),
  })),
  handler: async (ctx) => {
    const rider = await currentUser(ctx);
    if (rider.role !== "rider") throw new Error("Rider access required");
    const offers = await ctx.db.query("rideOffers")
      .withIndex("by_rider", (q: any) => q.eq("riderId", rider._id))
      .order("desc")
      .take(100);
    return Promise.all(offers.map(async (offer: any) => {
      const ride: any = await ctx.db.get(offer.rideId);
      return {
        _id: offer._id,
        rideId: offer.rideId,
        fare: offer.fare,
        status: offer.status,
        createdAt: offer.createdAt,
        pickupLabel: ride?.pickupLabel,
        destinationLabel: ride?.destinationLabel,
        expiresAt: ride?.expiresAt ?? (ride?.requestedAt ?? offer.createdAt) + 10 * 60 * 1000,
        requestStatus: ride?.requestStatus,
      };
    }));
  },
});

async function confirmRideOfferHandler(ctx: any, args: { rideId: any; offerId: any }) {
    const customer = await currentUser(ctx);
    if (customer.role !== "student") throw new Error("Customer access required");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== customer._id) throw new Error("Ride access denied");
    if (!["requested", "negotiating"].includes(ride.status) ||
      (ride.requestStatus !== "searching" && ride.requestStatus !== "offers_available")) {
      return { success: false, message: "This ride request is no longer available." };
    }
    const now = Date.now();
    if ((ride.expiresAt ?? ride.requestedAt + 10 * 60 * 1000) <= now) {
      await ctx.db.patch(ride._id, {
        status: "cancelled",
        requestStatus: "expired",
        paymentStatus: "cancelled",
        cancelledAt: now,
        cancellationReason: "request_expired",
      });
      const expiredOffers = await ctx.db.query("rideOffers")
        .withIndex("by_ride", (q: any) => q.eq("rideId", ride._id))
        .take(100);
      for (const offer of expiredOffers) {
        if (offer.status === "submitted") {
          await ctx.db.patch(offer._id, { status: "closed", updatedAt: now });
          await notify(ctx, {
            userId: offer.riderId,
            type: "ride_expired",
            title: "Ride request expired",
            body: "This customer request expired before a rider was selected.",
            rideId: ride._id,
            offerId: offer._id,
            destination: "dashboard",
          });
        }
      }
      await notify(ctx, {
        userId: customer._id,
        type: "ride_expired",
        title: "Ride request expired",
        body: "This request expired before an offer could be booked. You can request another ride.",
        rideId: ride._id,
        destination: "booking",
      });
      return { success: false, message: "This request expired. Please create a new ride request." };
    }

    const offer = await ctx.db.get(args.offerId);
    if (!offer || offer.rideId !== ride._id || offer.status !== "submitted") {
      return { success: false, message: "This price offer is no longer available." };
    }
    const rider = await ctx.db.get(offer.riderId);
    if (!rider || rider.role !== "rider" || rider.verificationStatus !== "approved" ||
      rider.isOnline !== true || await hasActiveRide(ctx, rider, ride._id)) {
      await ctx.db.patch(offer._id, { status: "withdrawn", updatedAt: now });
      return { success: false, message: "That rider is no longer available. Choose another offer." };
    }
    if (await hasActiveRide(ctx, customer, ride._id)) {
      return { success: false, message: "Complete your current ride before booking another." };
    }

    await ctx.db.patch(ride._id, {
      riderId: rider._id,
      fare: offer.fare,
      offeredFare: offer.fare,
      agreedFare: offer.fare,
      status: "accepted",
      requestStatus: "booked",
      acceptedAt: now,
      paymentStatus: "paid",
    });
    await holdRidePayment(ctx, customer, { ...ride, fare: offer.fare }, rider._id);
    await ctx.db.patch(rider._id, { activeRideId: ride._id });
    await ctx.db.patch(offer._id, { status: "accepted", updatedAt: now });

    const competingOffers = await ctx.db.query("rideOffers")
      .withIndex("by_ride", (q: any) => q.eq("rideId", ride._id))
      .take(100);
    for (const competing of competingOffers) {
      if (competing._id === offer._id || competing.status !== "submitted") continue;
      await ctx.db.patch(competing._id, { status: "rejected", updatedAt: now });
      await notify(ctx, {
        userId: competing.riderId,
        type: "offer_closed",
        title: "Ride request was booked",
        body: "The customer selected another rider for this request.",
        rideId: ride._id,
        offerId: competing._id,
        destination: "dashboard",
      });
    }
    const otherRiderOffers = await ctx.db.query("rideOffers")
      .withIndex("by_rider", (q: any) => q.eq("riderId", rider._id))
      .order("desc")
      .take(100);
    for (const otherOffer of otherRiderOffers) {
      if (otherOffer._id === offer._id || otherOffer.status !== "submitted") continue;
      const otherRide = await ctx.db.get(otherOffer.rideId);
      if (!otherRide || !["requested", "negotiating"].includes(otherRide.status) ||
        (otherRide.requestStatus !== "searching" && otherRide.requestStatus !== "offers_available")) continue;
      await ctx.db.patch(otherOffer._id, { status: "withdrawn", updatedAt: now });
      await notify(ctx, {
        userId: otherRide.userId,
        type: "offer_closed",
        title: "Rider offer withdrawn",
        body: "This rider accepted another ride and is no longer available for your request.",
        rideId: otherRide._id,
        offerId: otherOffer._id,
        destination: "dashboard",
      });
    }
    const customerRides = await ctx.db.query("rides")
      .withIndex("by_user", (q: any) => q.eq("userId", customer._id))
      .order("desc")
      .take(100);
    for (const otherRide of customerRides) {
      if (otherRide._id === ride._id || !["requested", "negotiating"].includes(otherRide.status)) continue;
      await settleRideCancellation(ctx, customer, otherRide, false, "another_request_accepted");
    }
    await notify(ctx, {
      userId: customer._id,
      type: "offer_accepted",
      title: "Rider selected",
      body: `${rider.name ?? "Your rider"} is assigned at ₦${offer.fare.toLocaleString("en-NG")}. The fare is held securely in escrow.`,
      rideId: ride._id,
      offerId: offer._id,
      destination: "dashboard",
    });
    await notify(ctx, {
      userId: rider._id,
      type: "offer_accepted",
      title: "Your price offer was accepted",
      body: `The customer selected your ₦${offer.fare.toLocaleString("en-NG")} offer.`,
      rideId: ride._id,
      offerId: offer._id,
      destination: "dashboard",
    });
    return { success: true };
}

const rideOfferConfirmationArgs = { rideId: v.id("rides"), offerId: v.id("rideOffers") };
const rideOfferConfirmationReturns = v.object({ success: v.boolean(), message: v.optional(v.string()) });

export const selectRideOffer = mutation({
  args: rideOfferConfirmationArgs,
  returns: rideOfferConfirmationReturns,
  handler: confirmRideOfferHandler,
});

export const confirmRideOffer = mutation({
  args: rideOfferConfirmationArgs,
  returns: rideOfferConfirmationReturns,
  handler: confirmRideOfferHandler,
});

export const declineRideOffer = mutation({
  args: { rideId: v.id("rides"), offerId: v.id("rideOffers") },
  returns: v.object({ success: v.boolean(), message: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const customer = await currentUser(ctx);
    if (customer.role !== "student") throw new Error("Customer access required");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== customer._id) throw new Error("Ride access denied");
    const offer = await ctx.db.get(args.offerId);
    if (!offer || offer.rideId !== ride._id || offer.status !== "submitted") {
      return { success: false, message: "This price offer is no longer available." };
    }
    await ctx.db.patch(offer._id, { status: "rejected", updatedAt: Date.now() });
    await notify(ctx, {
      userId: offer.riderId,
      type: "offer_closed",
      title: "Price offer declined",
      body: "The customer declined your price offer.",
      rideId: ride._id,
      offerId: offer._id,
      destination: "dashboard",
    });
    return { success: true };
  },
});

export const listMyNotifications = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("notifications"),
    type: v.union(
      v.literal("ride_request"),
      v.literal("ride_offer"),
      v.literal("offer_accepted"),
      v.literal("offer_closed"),
      v.literal("ride_cancelled"),
      v.literal("ride_expired"),
      v.literal("payment_confirmed"),
      v.literal("ride_status"),
    ),
    title: v.string(),
    body: v.string(),
    rideId: v.optional(v.id("rides")),
    offerId: v.optional(v.id("rideOffers")),
    destination: v.string(),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    const notifications = await ctx.db.query("notifications")
      .withIndex("by_user_created", (q: any) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
    return notifications.map((notification: any) => ({
      _id: notification._id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      rideId: notification.rideId,
      offerId: notification.offerId,
      destination: notification.destination,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
    }));
  },
});

export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== user._id) {
      throw new Error("Notification not found");
    }
    if (notification.readAt === undefined) {
      await ctx.db.patch(notification._id, { readAt: Date.now() });
    }
    return null;
  },
});
