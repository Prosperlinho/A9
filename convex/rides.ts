import { internalMutation, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ensurePaystackRideRefund } from "./refundHelpers";

const rideStatusValidator = v.union(
  v.literal("requested"),
  v.literal("negotiating"),
  v.literal("offer_made"),
  v.literal("accepted"),
  v.literal("rider_arriving"),
  v.literal("in_progress"),
  v.literal("awaiting_confirmation"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("disputed"),
  v.literal("expired"),
);
const rideLocationValidator = v.object({
  name: v.string(),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
});
const RIDER_ARRIVAL_TIMEOUT_MS = 15 * 60 * 1000;
const REQUEST_EXPIRATION_MS = 10 * 60 * 1000;
const MAX_ACTIVE_RIDE_REQUESTS = 5;
const MINIMUM_RIDE_FARE_NGN = 250;
const schoolLocationGroups = [
  {
    id: "backgate",
    label: "BACKGATE",
    locations: [
      ["greenhouse", "Greenhouse"],
      ["prestige", "Prestige"],
      ["chikamso", "Chikamso"],
      ["let-love-lead", "Let Love Lead"],
      ["divine-lodge", "Divine Lodge"],
      ["nwabuking", "Nwabuking"],
      ["jubilation-lodge", "Jubilation Lodge"],
    ],
  },
  {
    id: "frontgate",
    label: "FRONTGATE",
    locations: [
      ["excellent-lodge", "Excellent Lodge"],
      ["emmanuel-god-with-us", "Emmanuel God With Us"],
      ["lakass", "Lakass"],
      ["amazing-grace", "Amazing Grace"],
      ["gas-station", "Gas Station"],
      ["up-jesus", "Up Jesus"],
    ],
  },
  {
    id: "school-area",
    label: "SCHOOL AREA",
    locations: [
      ["legal-unit", "Legal Unit"],
      ["convo", "Convo"],
      ["physical-science", "Physical Science"],
      ["education", "Education"],
      ["humanities", "Humanities"],
      ["c-block", "C-Block"],
      ["new-girls-hostel", "New Girls Hostel"],
      ["old-girls-hostel", "Old Girls Hostel"],
      ["boys-hostel", "Boys Hostel"],
      ["theatre-art", "Theatre Art"],
      ["school-clinic", "School Clinic"],
      ["bursary", "Bursary"],
    ],
  },
] as const;
const schoolLocations = schoolLocationGroups.flatMap((group) =>
  group.locations.map(([slug, name]) => ({ slug, name, group: group.id, groupLabel: group.label })),
);
const locationGroupValidator = v.union(
  v.literal("backgate"),
  v.literal("frontgate"),
  v.literal("school-area"),
);
const schoolLocationReturn = v.object({
  _id: v.id("locations"),
  slug: v.string(),
  name: v.string(),
  group: locationGroupValidator,
  groupLabel: v.string(),
  detail: v.string(),
  active: v.boolean(),
  city: v.optional(v.string()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  countryCode: v.optional(v.string()),
  state: v.optional(v.string()),
});
async function activeSchoolLocations(ctx: any) {
  const activeLocations = await ctx.db
    .query("locations")
    .withIndex("by_active", (q: any) => q.eq("active", true))
    .take(100);
  return schoolLocations.flatMap((definition) => {
    const item = activeLocations.find((location: any) => location.slug === definition.slug);
    if (!item) return [];
    return [{
      _id: item._id,
      slug: definition.slug,
      name: definition.name,
      group: definition.group,
      groupLabel: definition.groupLabel,
      detail: item.detail,
      active: item.active,
      latitude: item.latitude,
      longitude: item.longitude,
      countryCode: item.countryCode,
      state: item.state,
      city: item.city,
      lat: item.lat,
      lng: item.lng,
    }];
  });
}
const rideReturn = v.object({
  _id: v.id("rides"),
  userId: v.id("users"),
  riderId: v.optional(v.id("users")),
  pickupLocationId: v.optional(v.id("locations")),
  destinationLocationId: v.optional(v.id("locations")),
  pickupLabel: v.optional(v.string()),
  destinationLabel: v.optional(v.string()),
  pickupCity: v.optional(v.string()),
  pickupState: v.optional(v.string()),
  destinationCity: v.optional(v.string()),
  destinationState: v.optional(v.string()),
  pickupLatitude: v.optional(v.number()),
  pickupLongitude: v.optional(v.number()),
  destinationLatitude: v.optional(v.number()),
  destinationLongitude: v.optional(v.number()),
  distance: v.number(),
  estimatedFare: v.number(),
  fare: v.optional(v.number()),
  offeredFare: v.optional(v.number()),
  agreedFare: v.optional(v.number()),
  proposedPrice: v.optional(v.number()),
  proposedBy: v.optional(v.id("users")),
  negotiationStartedAt: v.optional(v.number()),
  paymentStatus: v.optional(v.union(v.literal("pending"), v.literal("paid"), v.literal("failed"), v.literal("cancelled"), v.literal("processing"))),
  paymentStage: v.optional(v.union(v.literal("unpaid"), v.literal("paid_held"), v.literal("awaiting_completion"), v.literal("eligible_for_rider"), v.literal("pending_payout"), v.literal("paid_to_rider"), v.literal("refunded"), v.literal("disputed"))),
  paymentAmount: v.optional(v.number()),
  studentName: v.optional(v.string()),
  status: rideStatusValidator,
  requestedAt: v.number(),
  expiresAt: v.number(),
  serverNow: v.number(),
  acceptedAt: v.optional(v.number()),
  cancelledAt: v.optional(v.number()),
  cancellationReason: v.optional(v.string()),
  completionRequestedAt: v.optional(v.number()),
  completionConfirmedAt: v.optional(v.number()),
  completionConfirmedBy: v.optional(v.id("users")),
  ratingSubmittedAt: v.optional(v.number()),
  disputeReportedAt: v.optional(v.number()),
  disputeReportedBy: v.optional(v.id("users")),
  disputeReason: v.optional(v.string()),
  requestStatus: v.optional(v.union(
    v.literal("searching"),
    v.literal("offers_available"),
    v.literal("booked"),
    v.literal("cancelled"),
    v.literal("expired"),
  )),
});
const rideFields = (ride: any) => ({
  _id: ride._id,
  userId: ride.userId,
  riderId: ride.riderId,
  pickupLocationId: ride.pickupLocationId,
  destinationLocationId: ride.destinationLocationId,
  pickupLabel: ride.pickupLabel,
  destinationLabel: ride.destinationLabel,
  pickupCity: ride.pickupCity,
  pickupState: ride.pickupState,
  destinationCity: ride.destinationCity,
  destinationState: ride.destinationState,
  pickupLatitude: ride.pickupLatitude,
  pickupLongitude: ride.pickupLongitude,
  destinationLatitude: ride.destinationLatitude,
  destinationLongitude: ride.destinationLongitude,
  distance: Number.isFinite(ride.distance) ? ride.distance : 1,
  estimatedFare: Number.isFinite(ride.estimatedFare)
    ? ride.estimatedFare
    : Number.isFinite(ride.agreedFare) ? ride.agreedFare : MINIMUM_RIDE_FARE_NGN,
  fare: ride.fare,
  offeredFare: ride.offeredFare,
  agreedFare: ride.agreedFare,
  proposedPrice: ride.proposedPrice,
  proposedBy: ride.proposedBy,
  negotiationStartedAt: ride.negotiationStartedAt,
  paymentStatus: ride.paymentStatus,
  paymentStage: undefined,
  paymentAmount: undefined,
  studentName: undefined,
  status: ride.status,
  requestedAt: ride.requestedAt,
  expiresAt: ride.expiresAt ?? ride.requestedAt + REQUEST_EXPIRATION_MS,
  serverNow: Date.now(),
  acceptedAt: ride.acceptedAt,
  cancelledAt: ride.cancelledAt,
  cancellationReason: ride.cancellationReason,
  completionRequestedAt: ride.completionRequestedAt,
  completionConfirmedAt: ride.completionConfirmedAt,
  completionConfirmedBy: ride.completionConfirmedBy,
  ratingSubmittedAt: ride.ratingSubmittedAt,
  disputeReportedAt: ride.disputeReportedAt,
  disputeReportedBy: ride.disputeReportedBy,
  disputeReason: ride.disputeReason,
  requestStatus: ride.requestStatus,
});
function hasUsableRideIdentity(ride: any) {
  return Boolean(
    ride &&
    typeof ride._id === "string" &&
    typeof ride.userId === "string" &&
    ["requested", "negotiating", "offer_made", "accepted", "rider_arriving", "in_progress", "awaiting_confirmation", "completed", "cancelled", "disputed", "expired"].includes(ride.status) &&
    Number.isFinite(ride.requestedAt) &&
    (ride.expiresAt === undefined || Number.isFinite(ride.expiresAt)),
  );
}
async function rideFieldsWithPayment(ctx: any, ride: any): Promise<any> {
  if (!hasUsableRideIdentity(ride)) {
    console.error("Skipping malformed ride in dashboard query", ride?._id);
    return null;
  }
  const optionalStrings = [
    ride.pickupLabel,
    ride.destinationLabel,
    ride.pickupCity,
    ride.pickupState,
    ride.destinationCity,
    ride.destinationState,
    ride.cancellationReason,
    ride.disputeReason,
  ];
  const optionalNumbers = [
    ride.pickupLatitude,
    ride.pickupLongitude,
    ride.destinationLatitude,
    ride.destinationLongitude,
    ride.distance,
    ride.estimatedFare,
    ride.fare,
    ride.offeredFare,
    ride.agreedFare,
    ride.proposedPrice,
    ride.negotiationStartedAt,
    ride.acceptedAt,
    ride.cancelledAt,
    ride.completionRequestedAt,
    ride.completionConfirmedAt,
    ride.ratingSubmittedAt,
    ride.disputeReportedAt,
  ];
  if (
    optionalStrings.some((value) => value !== undefined && typeof value !== "string") ||
    optionalNumbers.some((value) => value !== undefined && !Number.isFinite(value)) ||
    [ride.riderId, ride.pickupLocationId, ride.destinationLocationId, ride.proposedBy, ride.completionConfirmedBy, ride.disputeReportedBy]
      .some((value) => value !== undefined && typeof value !== "string") ||
    (ride.requestStatus !== undefined && !["searching", "offers_available", "booked", "cancelled", "expired"].includes(ride.requestStatus)) ||
    (ride.paymentStatus !== undefined && !["pending", "paid", "failed", "cancelled", "processing"].includes(ride.paymentStatus))
  ) {
    console.error("Skipping malformed ride fields in dashboard query", ride._id);
    return null;
  }
  try {
    const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).first();
    const student = await ctx.db.get(ride.userId);
    const paymentStatus = payment?.status ?? ride.paymentStatus ?? "pending";
    const paymentStage = payment?.paymentStage ?? ride.paymentStage ?? (paymentStatus === "paid" ? "paid_held" : "unpaid");
    const result = {
      ...rideFields(ride),
      paymentStatus,
      paymentStage,
      paymentAmount: payment?.amount ?? ride.paymentAmount ?? ride.fare,
      studentName: student?.name,
    };
    if (result.paymentAmount !== undefined && !Number.isFinite(result.paymentAmount)) {
      console.error("Skipping malformed ride payment amount in dashboard query", ride._id);
      return null;
    }
    if (result.studentName !== undefined && typeof result.studentName !== "string") {
      console.error("Skipping malformed ride passenger in dashboard query", ride._id);
      return null;
    }
    if (!["unpaid", "paid_held", "awaiting_completion", "eligible_for_rider", "pending_payout", "paid_to_rider", "refunded", "disputed"].includes(paymentStage)) {
      console.error("Skipping malformed ride payment stage in dashboard query", ride._id);
      return null;
    }
    return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
  } catch (error) {
    console.error("Skipping ride that could not be loaded in dashboard query", ride._id, error);
    return null;
  }
}
async function currentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in required");
  const userId = await getAuthUserId(ctx);
  const directUser = userId ? await ctx.db.get(userId) : null;
  const mapping = directUser ? null : await ctx.db.query("userIdentityMappings")
    .withIndex("by_subject", (q: any) => q.eq("subject", identity.subject))
    .unique();
  const user = directUser ?? (mapping ? await ctx.db.get(mapping.userId) : null);
  if (!user) throw new Error("Account profile not found");
  return user;
}
async function resolveRideLocation(ctx: any, locationId: any, input: any) {
  if (Boolean(locationId) === Boolean(input)) {
    throw new Error("Provide either a saved location or a location name");
  }
  if (input) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const city = typeof input.city === "string" ? input.city.trim() : "";
    const state = typeof input.state === "string" ? input.state.trim() : "";
    if (!name) throw new Error("Enter a location name");
    const latitude = input.lat;
    const longitude = input.lng;
    if ((latitude !== undefined && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) ||
        (longitude !== undefined && (!Number.isFinite(longitude) || Math.abs(longitude) > 180))) {
      throw new Error("Ride location coordinates are invalid");
    }
    return {
      name,
      city,
      state,
      latitude,
      longitude,
      label: [name, city, state].filter(Boolean).join(", "),
    };
  }
  const location = await ctx.db.get(locationId);
  if (!location?.active || !schoolLocations.some((item) => item.slug === location.slug)) {
    throw new Error("Select a valid A9 school location");
  }
  const definition = schoolLocations.find((item) => item.slug === location.slug)!;
  return {
    name: definition.name,
    city: location.city ?? "",
    state: location.state ?? "",
    latitude: location.latitude ?? location.lat,
    longitude: location.longitude ?? location.lng,
    label: `${definition.groupLabel} · ${definition.name}`,
  };
}
function requestExpiration(ride: any) {
  return ride.expiresAt ?? ride.requestedAt + REQUEST_EXPIRATION_MS;
}
function isGeneratedSchoolCoordinate(latitude: number | undefined, longitude: number | undefined, index: number) {
  return latitude === 6.297 + (index % 6) * 0.0011 &&
    longitude === 8.101 + Math.floor(index / 6) * 0.0011;
}
function cancellationAmounts(fare: number) {
  if (!Number.isSafeInteger(fare) || fare < 0) throw new Error("Ride fare is invalid");
  const fareKobo = fare * 100;
  if (!Number.isSafeInteger(fareKobo)) throw new Error("Ride fare exceeds the supported amount");
  const cancellationFeeKobo = Math.trunc(fareKobo / 5);
  return { fareKobo, cancellationFeeKobo, fullRefundKobo: fareKobo };
}
function isRiderArrivalTimeoutEligible(ride: any, now = Date.now()) {
  return ["accepted", "rider_arriving"].includes(ride.status) &&
    ride.acceptedAt !== undefined &&
    now - ride.acceptedAt >= RIDER_ARRIVAL_TIMEOUT_MS;
}
function isHeldRidePayment(payment: any) {
  return payment?.status === "paid" &&
    payment.ledgerStatus === "held" &&
    ["paid_held", "awaiting_completion"].includes(payment.paymentStage);
}
export async function settleRideCancellation(ctx: any, current: any, ride: any, chargeFee: boolean, cancellationReason?: string) {
  if (ride.status === "cancelled") return null;
  if (!["requested", "negotiating", "offer_made", "accepted", "rider_arriving", "in_progress"].includes(ride.status)) {
    throw new Error("Cancellation is not allowed for this ride");
  }
  const student = await ctx.db.get(ride.userId);
  if (!student) throw new Error("Ride owner not found");
  const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).unique();
  const paymentWasHeld = isHeldRidePayment(payment);
  const refundPaystackPayment = payment?.status === "paid" && !paymentWasHeld &&
    (payment.method === "paystack" || payment.method === undefined);
  if (chargeFee && !paymentWasHeld && ride.requestStatus !== "booked") {
    throw new Error("Held ride payment not found; cancellation was not processed");
  }
  const amounts = cancellationAmounts(paymentWasHeld && payment ? payment.amount : ride.fare ?? 0);
  const cancellationFeeKobo = paymentWasHeld && chargeFee ? amounts.cancellationFeeKobo : 0;
  const refundKobo = paymentWasHeld
    ? amounts.fullRefundKobo - cancellationFeeKobo
    : refundPaystackPayment ? amounts.fullRefundKobo : 0;
  const cancellationFee = cancellationFeeKobo / 100;
  const refundAmount = refundKobo / 100;
  const cancelledAt = Date.now();
  const finalCancellationReason = cancellationReason ?? (current.role === "student" ? "student_cancelled" : "rider_cancelled");
  const systemCancellation = ["another_request_accepted", "request_expired"].includes(finalCancellationReason);

  if (refundKobo > 0 && paymentWasHeld) {
    await ctx.db.patch(student._id, { walletBalance: student.walletBalance + refundAmount });
    await ctx.db.insert("walletTransactions", {
      userId: student._id,
      amount: refundAmount,
      type: "ride_refund",
      description: cancellationFeeKobo > 0 ? "Ride cancellation refund after fee" : "Full refund for cancelled ride",
      rideId: ride._id,
      currency: "NGN",
      status: "completed",
      createdAt: cancelledAt,
      provider: "a9_wallet",
      providerReference: `A9-RIDE-REFUND-${String(ride._id)}`,
    });
  }

  if (payment) {
    if (refundPaystackPayment) {
      await ensurePaystackRideRefund(ctx, payment, ride, cancelledAt);
    }
    await ctx.db.patch(payment._id, {
      status: "cancelled",
      paymentStage: paymentWasHeld ? "refunded" : "unpaid",
      ledgerStatus: paymentWasHeld ? "refunded" : undefined,
      payoutStatus: undefined,
      cancellationFeeAmount: cancellationFee,
      refundedAmount: paymentWasHeld ? refundAmount : undefined,
      cancelledAt,
    });
    const paymentLedger = await ctx.db.query("financialLedger")
      .withIndex("by_payment", (q: any) => q.eq("paymentId", payment._id))
      .take(20);
    const hold = paymentLedger.find((entry: any) => entry.kind === "payment_pool_hold");
    if (hold) await ctx.db.patch(hold._id, { status: paymentWasHeld ? "settled_after_cancellation" : "released" });
    const ridePayment = paymentLedger.find((entry: any) => entry.kind === "ride_payment");
    if (ridePayment) await ctx.db.patch(ridePayment._id, { status: paymentWasHeld ? "cancelled" : "unpaid" });

    if (refundKobo > 0 && paymentWasHeld) {
      await ctx.db.insert("financialLedger", {
        kind: "refund",
        direction: "debit",
        userId: student._id,
        rideId: ride._id,
        paymentId: payment._id,
        amount: refundAmount,
        currency: "NGN",
        reference: `A9-RIDE-REFUND-${String(ride._id)}`,
        status: "completed",
        createdAt: cancelledAt,
      });
    }
    if (cancellationFeeKobo > 0) {
      await ctx.db.insert("financialLedger", {
        kind: "cancellation_fee",
        direction: "credit",
        userId: student._id,
        rideId: ride._id,
        paymentId: payment._id,
        amount: cancellationFee,
        currency: "NGN",
        reference: `A9-CANCELLATION-FEE-${String(ride._id)}`,
        status: "recognized",
        createdAt: cancelledAt,
      });
      await ctx.db.insert("walletTransactions", {
        userId: student._id,
        amount: cancellationFee,
        type: "cancellation_fee",
        description: "Cancellation fee retained from held ride payment",
        rideId: ride._id,
        currency: "NGN",
        status: "completed",
        createdAt: cancelledAt,
        provider: "a9_wallet",
        providerReference: `A9-CANCELLATION-FEE-${String(ride._id)}`,
      });
    }
  }

  await ctx.db.patch(ride._id, {
    status: "cancelled",
    paymentStatus: "cancelled",
    cancelledAt,
    cancellationReason: finalCancellationReason,
    ...(ride.requestStatus ? { requestStatus: "cancelled" } : {}),
  });
  if (ride.requestStatus) {
    const offers = await ctx.db.query("rideOffers")
      .withIndex("by_ride", (q: any) => q.eq("rideId", ride._id))
      .take(100);
    for (const offer of offers) {
      if (offer.status === "submitted" || offer.status === "accepted") {
        await ctx.db.patch(offer._id, { status: "closed", updatedAt: cancelledAt });
        if (offer.riderId !== current._id) {
          await ctx.db.insert("notifications", {
            userId: offer.riderId,
            type: "ride_cancelled",
            title: "Ride request cancelled",
            body: systemCancellation
              ? "This request was closed because it is no longer available."
              : current.role === "rider"
                ? "The assigned rider cancelled this ride request."
                : "The customer cancelled this ride request.",
            rideId: ride._id,
            offerId: offer._id,
            destination: "dashboard",
            createdAt: cancelledAt,
          });
        }
      }
    }
    await ctx.db.insert("notifications", {
      userId: ride.userId,
      type: "ride_cancelled",
      title: "Ride request cancelled",
      body: systemCancellation
        ? "This ride request was closed because it is no longer available."
        : current.role === "rider"
          ? "Your assigned rider cancelled this ride."
          : "Your ride request has been cancelled.",
      rideId: ride._id,
      destination: "booking",
      createdAt: cancelledAt,
    });
  }
  if (ride.riderId) {
    const rider = await ctx.db.get(ride.riderId);
    if (rider?.activeRideId === ride._id) {
      await ctx.db.patch(rider._id, { activeRideId: undefined });
    }
  }
  await ctx.db.insert("auditEvents", {
    category: "financial",
    action: "ride_cancellation_settled",
    status: cancellationFeeKobo > 0 ? "fee_applied" : "free",
    actorId: current._id,
    riderId: ride.riderId,
    rideId: ride._id,
    paymentId: payment?._id,
    reason: `${finalCancellationReason}; fare ${amounts.fareKobo} kobo; cancellation fee ${cancellationFeeKobo} kobo; wallet refund ${refundKobo} kobo`,
    createdAt: cancelledAt,
  });
  return null;
}
export const getCancellationQuote = query({
  args: { rideId: v.id("rides") },
  returns: v.object({
    canCancel: v.boolean(),
    isFree: v.boolean(),
    isArrivalTimeout: v.boolean(),
    fareKobo: v.number(),
    cancellationFeeKobo: v.number(),
    refundKobo: v.number(),
  }),
  handler: async (ctx, args) => {
    const student = await currentUser(ctx);
    if (student.role !== "student") throw new Error("Only students can cancel rides");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== student._id) throw new Error("This ride belongs to another student");
    const canCancel = ["requested", "negotiating", "offer_made", "accepted", "rider_arriving", "in_progress"].includes(ride.status);
    const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).unique();
    const hasHeldPayment = isHeldRidePayment(payment);
    const amounts = cancellationAmounts(hasHeldPayment && payment ? payment.amount : ride.fare ?? 0);
    const isArrivalTimeout = isRiderArrivalTimeoutEligible(ride);
    const cancellationFeeKobo = canCancel && hasHeldPayment && !["requested", "negotiating", "offer_made"].includes(ride.status) && !isArrivalTimeout
      ? amounts.cancellationFeeKobo
      : 0;
    return {
      canCancel,
      isFree: ["requested", "negotiating", "offer_made"].includes(ride.status) || isArrivalTimeout || !hasHeldPayment,
      isArrivalTimeout,
      fareKobo: amounts.fareKobo,
      cancellationFeeKobo,
      refundKobo: hasHeldPayment ? amounts.fullRefundKobo - cancellationFeeKobo : 0,
    };
  },
});
export const cancelRide = mutation({
  args: { rideId: v.id("rides") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const student = await currentUser(ctx);
    if (student.role !== "student") throw new Error("Only students can cancel rides");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== student._id) throw new Error("This ride belongs to another student");
    if (ride.status === "cancelled") return null;
    if (!["requested", "negotiating", "offer_made", "accepted", "rider_arriving", "in_progress"].includes(ride.status)) {
      throw new Error("Cancellation is not allowed for this ride");
    }
    const isArrivalTimeout = isRiderArrivalTimeoutEligible(ride);
    return settleRideCancellation(
      ctx,
      student,
      ride,
      !["requested", "negotiating", "offer_made"].includes(ride.status) && !isArrivalTimeout,
      isArrivalTimeout ? "rider_arrival_timeout" : undefined,
    );
  },
});
export const getRiderArrivalTimeoutQuote = query({
  args: { rideId: v.id("rides") },
  returns: v.object({
    acceptedAt: v.optional(v.number()),
    serverNow: v.number(),
    remainingMs: v.number(),
    canCancelFree: v.boolean(),
    fareKobo: v.number(),
    refundKobo: v.number(),
  }),
  handler: async (ctx, args) => {
    const student = await currentUser(ctx);
    if (student.role !== "student") throw new Error("Only students can cancel rides");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== student._id) throw new Error("This ride belongs to another student");
    const serverNow = Date.now();
    const activeBeforeStart = ["accepted", "rider_arriving"].includes(ride.status);
    const remainingMs = ride.acceptedAt === undefined
      ? RIDER_ARRIVAL_TIMEOUT_MS
      : Math.max(0, ride.acceptedAt + RIDER_ARRIVAL_TIMEOUT_MS - serverNow);
    const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).unique();
    const fareKobo = cancellationAmounts(ride.fare ?? 0).fareKobo;
    const paymentHeld = isHeldRidePayment(payment);
    const heldFareKobo = paymentHeld && payment ? cancellationAmounts(payment.amount).fareKobo : 0;
    return {
      acceptedAt: ride.acceptedAt,
      serverNow,
      remainingMs,
      canCancelFree: activeBeforeStart && ride.acceptedAt !== undefined && remainingMs === 0 && paymentHeld,
      fareKobo: paymentHeld ? heldFareKobo : fareKobo,
      refundKobo: paymentHeld ? heldFareKobo : 0,
    };
  },
});
export const cancelRideAfterArrivalTimeout = mutation({
  args: { rideId: v.id("rides") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const student = await currentUser(ctx);
    if (student.role !== "student") throw new Error("Only students can cancel rides");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== student._id) throw new Error("This ride belongs to another student");
    if (ride.status === "cancelled" && ride.cancellationReason === "rider_arrival_timeout") return null;
    if (!["accepted", "rider_arriving"].includes(ride.status)) {
      throw new Error("This ride is no longer eligible for an arrival-timeout cancellation");
    }
    if (ride.acceptedAt === undefined) throw new Error("Rider acceptance time is missing");
    if (Date.now() - ride.acceptedAt < RIDER_ARRIVAL_TIMEOUT_MS) {
      throw new Error("The rider's 15-minute arrival window has not elapsed");
    }
    const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).unique();
    if (!isHeldRidePayment(payment)) {
      throw new Error("Held ride payment not found; timeout cancellation was not processed");
    }
    return settleRideCancellation(ctx, student, ride, false, "rider_arrival_timeout");
  },
});
export async function holdRidePayment(ctx: any, student: any, ride: any, riderId: any) {
  if (!Number.isSafeInteger(ride.fare) || ride.fare < 0 || !Number.isSafeInteger(ride.fare * 100)) {
    throw new Error("Ride fare is invalid");
  }
  let payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).unique();
  if (payment?.status === "pending") {
    throw new Error("The customer's Paystack payment is still pending verification");
  }
  if (payment && payment.status !== "paid") {
    throw new Error("Ride payment cannot be held");
  }
  if (payment?.status === "paid" && payment.amount !== ride.fare) {
    throw new Error("Ride payment does not match the actual ride fare");
  }

  const now = Date.now();
  if (payment?.status !== "paid") {
    const availableBalance = student.walletBalance - (student.walletReserved ?? 0);
    if (availableBalance < ride.fare) {
      throw new Error(`Insufficient wallet balance. You need ${ride.fare.toLocaleString("en-NG")} NGN to accept this ride.`);
    }
    const paymentReference = payment?.paystackReference ?? `A9-WALLET-RIDE-${ride.bookingReference ?? String(ride._id)}`;
    if (payment) {
      await ctx.db.patch(payment._id, {
        riderId,
        amount: ride.fare,
        status: "paid",
        method: "wallet",
        ledgerStatus: "held",
        paymentStage: "paid_held",
        studentWalletTransactionReference: paymentReference,
        payoutStatus: "pending",
        paidAt: now,
        verificationAt: now,
      });
    } else {
      const paymentId = await ctx.db.insert("payments", {
        rideId: ride._id,
        studentId: student._id,
        riderId,
        amount: ride.fare,
        currency: "NGN",
        paystackReference: paymentReference,
        status: "paid",
        method: "wallet",
        ledgerStatus: "held",
        paymentStage: "paid_held",
        studentWalletTransactionReference: paymentReference,
        payoutStatus: "pending",
        createdAt: now,
        paidAt: now,
        verificationAt: now,
      });
      payment = await ctx.db.get(paymentId);
    }
    await ctx.db.patch(student._id, { walletBalance: student.walletBalance - ride.fare });
    await ctx.db.insert("walletTransactions", {
      userId: student._id,
      amount: -ride.fare,
      type: "ride_charge",
      description: "Ride payment held by A9 after rider acceptance",
      rideId: ride._id,
      createdAt: now,
      provider: "a9_wallet",
      providerReference: paymentReference,
    });
  } else {
    await ctx.db.patch(payment._id, { riderId, ledgerStatus: "held", paymentStage: "paid_held" });
  }

  if (!payment) throw new Error("Ride payment could not be created");
  const paymentLedger = await ctx.db.query("financialLedger")
    .withIndex("by_payment", (q: any) => q.eq("paymentId", payment._id))
    .take(20);
  if (!paymentLedger.some((entry: any) => entry.kind === "ride_payment")) {
    await ctx.db.insert("financialLedger", {
      kind: "ride_payment",
      direction: "debit",
      userId: student._id,
      rideId: ride._id,
      paymentId: payment._id,
      amount: ride.fare,
      currency: "NGN",
      reference: payment.paystackReference,
      status: "paid_held",
      createdAt: now,
    });
  }
  if (!paymentLedger.some((entry: any) => entry.kind === "payment_pool_hold")) {
    await ctx.db.insert("financialLedger", {
      kind: "payment_pool_hold",
      direction: "credit",
      userId: student._id,
      rideId: ride._id,
      paymentId: payment._id,
      amount: ride.fare,
      currency: "NGN",
      reference: `${payment.paystackReference}-POOL`,
      status: "held",
      createdAt: now,
    });
  }
  return payment._id;
}

export const listLocations = query({
  args: {},
  returns: v.array(schoolLocationReturn),
  handler: activeSchoolLocations,
});
export const ensureLocations = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const existing = await ctx.db.query("locations").collect();
    const allowedSlugs = new Set<string>(schoolLocations.map((location) => location.slug));
    const existingBySlug = new Map(existing.filter((item: any) => item.slug).map((item: any) => [item.slug, item]));
    for (const item of existing) {
      if (item.active && (!item.slug || !allowedSlugs.has(item.slug))) await ctx.db.patch(item._id, { active: false });
    }
    for (const [index, location] of schoolLocations.entries()) {
      const { slug, name, group } = location;
      const current = existingBySlug.get(slug);
      if (current) {
        const generatedCoordinates = isGeneratedSchoolCoordinate(current.latitude, current.longitude, index);
        await ctx.db.patch(current._id, {
          name, slug, group, active: true, detail: "AE-FUNAI school location", countryCode: "NG", state: "Ebonyi",
          ...(generatedCoordinates ? { latitude: undefined, longitude: undefined } : {}),
        });
      } else {
        await ctx.db.insert("locations", { slug, name, group, detail: "AE-FUNAI school location", active: true, countryCode: "NG", state: "Ebonyi" });
      }
    }
    return null;
  },
});
export const listSchoolLocations = query({
  args: {},
  returns: v.array(schoolLocationReturn),
  handler: activeSchoolLocations,
});
export const updateSchoolLocationCoordinates = mutation({
  args: {
    locationId: v.id("locations"),
    latitude: v.number(),
    longitude: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await currentUser(ctx);
    if (current.role !== "admin") throw new Error("Administrator access required");
    if (!Number.isFinite(args.latitude) || Math.abs(args.latitude) > 90 ||
        !Number.isFinite(args.longitude) || Math.abs(args.longitude) > 180) {
      throw new Error("Enter valid latitude and longitude coordinates");
    }
    const location = await ctx.db.get(args.locationId);
    if (!location?.active || !schoolLocations.some((item) => item.slug === location.slug)) {
      throw new Error("A9 school location not found");
    }
    await ctx.db.patch(location._id, { latitude: args.latitude, longitude: args.longitude });
    return null;
  },
});
export const createRide = mutation({
  args: {
    pickupLocationId: v.optional(v.id("locations")),
    destinationLocationId: v.optional(v.id("locations")),
    pickup: v.optional(rideLocationValidator),
    destination: v.optional(rideLocationValidator),
    bookingReference: v.string(),
  },
  returns: v.id("rides"),
  handler: async (ctx, args) => {
    const current = await currentUser(ctx);
    if (current.role !== "student")
      throw new Error("Only students can book rides");
    const existingRide = await ctx.db
      .query("rides")
      .withIndex("by_booking_reference", (q: any) => q.eq("bookingReference", args.bookingReference))
      .first();
    if (existingRide && existingRide.userId === current._id) return existingRide._id;
    const activeRides = await ctx.db.query("rides")
      .withIndex("by_user", (q: any) => q.eq("userId", current._id))
      .order("desc")
      .take(100);
    if (activeRides.filter((ride: any) => ["requested", "negotiating", "accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(ride.status)).length >= MAX_ACTIVE_RIDE_REQUESTS) {
      throw new Error("You can have up to 5 active ride requests at a time.");
    }
    const pickup = await resolveRideLocation(ctx, args.pickupLocationId, args.pickup);
    const destination = await resolveRideLocation(ctx, args.destinationLocationId, args.destination);
    if (pickup.label.toLowerCase() === destination.label.toLowerCase()) {
      throw new Error("Pickup and destination must be different");
    }
    const now = Date.now();
    const expiresAt = now + REQUEST_EXPIRATION_MS;
    const rideId = await ctx.db.insert("rides", {
      bookingReference: args.bookingReference,
      ...(args.pickupLocationId ? { pickupLocationId: args.pickupLocationId } : {}),
      ...(args.destinationLocationId ? { destinationLocationId: args.destinationLocationId } : {}),
      pickupLabel: pickup.label,
      destinationLabel: destination.label,
      pickupCity: pickup.city,
      pickupState: pickup.state,
      destinationCity: destination.city,
      destinationState: destination.state,
      ...(pickup.latitude !== undefined ? { pickupLatitude: pickup.latitude } : {}),
      ...(pickup.longitude !== undefined ? { pickupLongitude: pickup.longitude } : {}),
      ...(destination.latitude !== undefined ? { destinationLatitude: destination.latitude } : {}),
      ...(destination.longitude !== undefined ? { destinationLongitude: destination.longitude } : {}),
      paymentStatus: "pending",
      status: "requested",
      requestStatus: "searching",
      userId: current._id,
      requestedAt: now,
      expiresAt,
    });
    const riders = await ctx.db.query("users")
      .withIndex("by_role", (q: any) => q.eq("role", "rider"))
      .take(100);
    for (const rider of riders) {
      if (rider.isOnline !== true || rider.verificationStatus !== "approved" || rider.activeRideId) continue;
      const assignedRides = await ctx.db.query("rides")
        .withIndex("by_rider", (q: any) => q.eq("riderId", rider._id))
        .order("desc")
        .take(20);
      if (assignedRides.some((assigned: any) =>
        ["accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(assigned.status),
      )) continue;
      await ctx.db.insert("notifications", {
        userId: rider._id,
        type: "ride_request",
        title: "New ride request available",
        body: `A customer is waiting for a ride from ${pickup.label} to ${destination.label}. Submit a fare offer if interested.`,
        rideId,
        destination: "dashboard",
        createdAt: now,
      });
    }
    await ctx.db.insert("notifications", {
      userId: current._id,
      type: "ride_request",
      title: "Ride request sent",
      body: "We're notifying available riders. You'll receive a notification when a rider offers a price.",
      rideId,
      destination: "dashboard",
      createdAt: now,
    });
    await ctx.scheduler.runAfter(REQUEST_EXPIRATION_MS, internal.rides.expireRideRequest, { rideId });
    return rideId;
  },
});
export const startNegotiation = mutation({
  args: { rideId: v.id("rides") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rider = await currentUser(ctx);
    if (rider.role !== "rider") throw new Error("Rider access required");
    if (rider.verificationStatus !== "approved") throw new Error("Account Verification Required");
    if (rider.isOnline !== true) throw new Error("Go online before joining a negotiation");
    if (rider.activeRideId) throw new Error("Complete your current ride before joining another negotiation");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.status !== "requested" || ride.requestStatus !== "searching") {
      throw new Error("This ride request is no longer available");
    }
    if (requestExpiration(ride) <= Date.now()) throw new Error("This ride request has expired");
    const student = await ctx.db.get(ride.userId);
    if (!student || student.role !== "student") throw new Error("Customer account not found");
    const assigned = await ctx.db.query("rides")
      .withIndex("by_rider", (q: any) => q.eq("riderId", rider._id))
      .order("desc")
      .take(50);
    if (assigned.some((item: any) => ["negotiating", "accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(item.status))) {
      throw new Error("Complete your current ride before joining another negotiation");
    }
    const studentRides = await ctx.db.query("rides")
      .withIndex("by_user", (q: any) => q.eq("userId", student._id))
      .order("desc")
      .take(50);
    if (studentRides.some((item: any) => ["accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(item.status))) {
      throw new Error("The passenger already has another active ride");
    }
    const now = Date.now();
    await ctx.db.patch(ride._id, {
      riderId: rider._id,
      status: "negotiating",
      requestStatus: "offers_available",
      proposedPrice: undefined,
      proposedBy: undefined,
      negotiationStartedAt: now,
    });
    await ctx.db.patch(rider._id, { activeRideId: ride._id });
    await ctx.db.insert("notifications", {
      userId: student._id,
      type: "ride_offer",
      title: "A rider joined your negotiation room",
      body: (rider.name ?? "An A9 rider") + " joined your ride request. You can now exchange price offers.",
      rideId: ride._id,
      destination: "booking",
      createdAt: now,
    });
    return null;
  },
});
export const submitPriceOffer = mutation({
  args: { rideId: v.id("rides"), proposedPrice: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await currentUser(ctx);
    if (current.role !== "student" && current.role !== "rider") throw new Error("Ride access required");
    if (!Number.isSafeInteger(args.proposedPrice) || !Number.isSafeInteger(args.proposedPrice * 100) || args.proposedPrice < MINIMUM_RIDE_FARE_NGN) {
      throw new Error("Enter a whole-number price of at least ?250");
    }
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.status !== "negotiating" || !ride.riderId) throw new Error("This ride is not in an active negotiation");
    if (requestExpiration(ride) <= Date.now()) throw new Error("This negotiation has expired");
    if (current.role === "student" && ride.userId !== current._id) throw new Error("This ride belongs to another student");
    if (current.role === "rider" && ride.riderId !== current._id) throw new Error("This ride belongs to another rider");
    if (current.role === "rider" && (current.isOnline !== true || current.verificationStatus !== "approved")) {
      throw new Error("Only an online, verified rider can submit a price");
    }
    const otherPartyId = current.role === "student" ? ride.riderId : ride.userId;
    const now = Date.now();
    const mutuallyAgreed = ride.proposedPrice === args.proposedPrice && ride.proposedBy !== current._id;
    await ctx.db.patch(ride._id, {
      proposedPrice: args.proposedPrice,
      proposedBy: current._id,
      agreedFare: mutuallyAgreed ? args.proposedPrice : undefined,
    });
    await ctx.db.insert("notifications", {
      userId: otherPartyId,
      type: "ride_offer",
      title: "A new price was proposed",
      body: (current.name ?? (current.role === "student" ? "The passenger" : "Your rider")) + " proposed ?" + args.proposedPrice.toLocaleString("en-NG") + ". Open the negotiation room to respond.",
      rideId: ride._id,
      destination: current.role === "student" ? "dashboard" : "booking",
      createdAt: now,
    });
    return null;
  },
});
export const acceptFinalPriceAndLock = mutation({
  args: { rideId: v.id("rides"), agreedFare: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const student = await currentUser(ctx);
    if (student.role !== "student") throw new Error("Only the passenger can accept and pay");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== student._id || ride.status !== "negotiating" || !ride.riderId) {
      throw new Error("This negotiation is no longer available");
    }
    if (!Number.isSafeInteger(args.agreedFare) || args.agreedFare < MINIMUM_RIDE_FARE_NGN || ride.proposedPrice !== args.agreedFare) {
      throw new Error("Accept the current proposed price to continue");
    }
    if (ride.proposedBy === student._id && ride.agreedFare !== args.agreedFare) {
      throw new Error("The rider must accept your counter-offer before payment");
    }
    if (requestExpiration(ride) <= Date.now()) throw new Error("This negotiation has expired");
    const rider = await ctx.db.get(ride.riderId);
    if (!rider || rider.role !== "rider" || rider.verificationStatus !== "approved" || rider.isOnline !== true || rider.activeRideId !== ride._id) {
      throw new Error("The assigned rider is no longer available");
    }
    const otherRides = await ctx.db.query("rides")
      .withIndex("by_user", (q: any) => q.eq("userId", student._id))
      .order("desc")
      .take(100);
    if (otherRides.some((item: any) => item._id !== ride._id && ["accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(item.status))) {
      throw new Error("Complete your current ride before accepting another");
    }
    await holdRidePayment(ctx, student, { ...ride, fare: args.agreedFare }, rider._id);
    const now = Date.now();
    await ctx.db.patch(ride._id, {
      fare: args.agreedFare,
      offeredFare: args.agreedFare,
      agreedFare: args.agreedFare,
      status: "accepted",
      requestStatus: "booked",
      acceptedAt: now,
      paymentStatus: "paid",
    });
    await ctx.db.insert("notifications", {
      userId: rider._id,
      type: "offer_accepted",
      title: "Price accepted and payment secured",
      body: "The passenger accepted NGN " + args.agreedFare.toLocaleString("en-NG") + ". Payment is held securely in escrow.",
      rideId: ride._id,
      destination: "dashboard",
      createdAt: now,
    });
    await ctx.db.insert("notifications", {
      userId: student._id,
      type: "payment_confirmed",
      title: "Ride price accepted",
      body: "NGN " + args.agreedFare.toLocaleString("en-NG") + " is held securely in escrow until the ride is completed.",
      rideId: ride._id,
      destination: "dashboard",
      createdAt: now,
    });
    return null;
  },
});
export const expireRideRequest = internalMutation({
  args: { rideId: v.id("rides") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride || !["requested", "negotiating"].includes(ride.status) || requestExpiration(ride) > Date.now()) return null;
    const expiredAt = Date.now();
    if (ride.requestStatus) {
      const offers = await ctx.db.query("rideOffers")
        .withIndex("by_ride", (q: any) => q.eq("rideId", ride._id))
        .take(100);
      for (const offer of offers) {
        if (offer.status === "submitted") {
          await ctx.db.patch(offer._id, { status: "closed", updatedAt: expiredAt });
          await ctx.db.insert("notifications", {
            userId: offer.riderId,
            type: "ride_expired",
            title: "Ride request expired",
            body: "This customer request expired before a rider was selected.",
            rideId: ride._id,
            offerId: offer._id,
            destination: "dashboard",
            createdAt: expiredAt,
          });
        }
      }
      await ctx.db.patch(ride._id, {
        status: "cancelled",
        requestStatus: "expired",
        paymentStatus: "cancelled",
        cancelledAt: expiredAt,
        cancellationReason: "request_expired",
      });
      if (ride.riderId) {
        const rider = await ctx.db.get(ride.riderId);
        if (rider?.activeRideId === ride._id) await ctx.db.patch(rider._id, { activeRideId: undefined });
      }
      await ctx.db.insert("notifications", {
        userId: ride.userId,
        type: "ride_expired",
        title: "Ride request expired",
        body: offers.some((offer: any) => offer.status === "submitted")
          ? "This request expired before an offer could be booked. You can request another ride."
          : "No riders made an offer before this request expired. You can request another ride.",
        rideId: ride._id,
        destination: "booking",
        createdAt: expiredAt,
      });
      return null;
    }
    return settleRideCancellation(ctx, { _id: ride.userId, role: "student" }, ride, false, "request_expired");
  },
});
export const listOpenRides = query({
  args: {},
  returns: v.array(rideReturn),
  handler: async (ctx) => {
    const current = await currentUser(ctx);
    if (current.role !== "rider") return [];
    if (current.isOnline !== true || current.verificationStatus !== "approved" || current.activeRideId) return [];
    const assignedRides = await ctx.db.query("rides")
      .withIndex("by_rider", (q: any) => q.eq("riderId", current._id))
      .order("desc")
      .take(50);
    if (assignedRides.some((ride: any) =>
      ["accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(ride.status),
    )) return [];
    const declined = await ctx.db
      .query("declinedRides")
      .withIndex("by_rider", (q: any) => q.eq("riderId", current._id))
      .take(100);
    const declinedIds = new Set(declined.map((item: any) => item.rideId));
    const requestedRides = await ctx.db
      .query("rides")
      .withIndex("by_status", (q: any) => q.eq("status", "requested"))
      .take(50);
    const offeredRides = await ctx.db
      .query("rides")
      .withIndex("by_status", (q: any) => q.eq("status", "negotiating"))
      .take(50);
    const rides = [];
    for (const ride of [...requestedRides, ...offeredRides]) {
      if (!hasUsableRideIdentity(ride)) {
        console.error("Skipping malformed ride in open-ride query", ride?._id);
        continue;
      }
      if (requestExpiration(ride) <= Date.now()) continue;
      if (ride.requestStatus && !["searching", "offers_available"].includes(ride.requestStatus)) continue;
      if (declinedIds.has(ride._id) || (ride.riderId !== undefined && ride.riderId !== current._id)) continue;
      if (ride.requestStatus) {
        const existingOffer = await ctx.db.query("rideOffers")
          .withIndex("by_ride_rider", (q: any) => q.eq("rideId", ride._id).eq("riderId", current._id))
          .unique();
        if (existingOffer) continue;
      }
      const studentRides = await ctx.db.query("rides")
        .withIndex("by_user", (q: any) => q.eq("userId", ride.userId))
        .order("desc")
        .take(50);
      const hasAcceptedRide = studentRides.some((other: any) =>
        other._id !== ride._id && ["accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(other.status),
      );
      if (!hasAcceptedRide) rides.push(ride);
    }
    const results = await Promise.all(rides.map((ride: any) => rideFieldsWithPayment(ctx, ride)));
    return results.filter((ride: any) => ride !== null);
  },
});
export const listMyRides = query({
  args: {},
  returns: v.array(rideReturn),
  handler: async (ctx) => {
    const current = await currentUser(ctx);
    const rides = (
      await ctx.db
        .query("rides")
        .withIndex("by_user", (q: any) => q.eq("userId", current._id))
        .order("desc")
        .take(30)
    );
    const results = await Promise.all(rides.map((ride: any) => rideFieldsWithPayment(ctx, ride)));
    return results.filter((ride: any) => ride !== null);
  },
});
export const listRiderRides = query({
  args: {},
  returns: v.array(rideReturn),
  handler: async (ctx) => {
    const current = await currentUser(ctx);
    if (current.role !== "rider") throw new Error("Rider access required");
    const rides = (
      await ctx.db
        .query("rides")
        .withIndex("by_rider", (q: any) => q.eq("riderId", current._id))
        .order("desc")
        .take(30)
    );
    const results = await Promise.all(rides.map((ride: any) => rideFieldsWithPayment(ctx, ride)));
    return results.filter((ride: any) => ride !== null);
  },
});
export const rateCompletedRide = mutation({
  args: {
    rideId: v.id("rides"),
    stars: v.number(),
    comment: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const customer = await currentUser(ctx);
    if (customer.role !== "student") throw new Error("Only customers can rate rides");
    if (!Number.isInteger(args.stars) || args.stars < 1 || args.stars > 5) {
      throw new Error("Choose a rating from 1 to 5 stars");
    }
    const comment = args.comment?.trim();
    if (comment && comment.length > 280) throw new Error("Feedback must be 280 characters or fewer");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== customer._id) throw new Error("This ride belongs to another customer");
    if (ride.status !== "completed" || !ride.completionConfirmedAt || !ride.riderId) {
      throw new Error("Only completed rides can be rated");
    }
    const existing = await ctx.db.query("rideRatings")
      .withIndex("by_ride", (q: any) => q.eq("rideId", ride._id))
      .unique();
    if (existing || ride.ratingSubmittedAt !== undefined) throw new Error("This ride has already been rated");
    const rider = await ctx.db.get(ride.riderId);
    if (!rider || rider.role !== "rider") throw new Error("The assigned rider account was not found");
    const legacyRatings = rider.ratingCount === undefined
      ? await ctx.db.query("rideRatings").withIndex("by_rider", (q: any) => q.eq("riderId", rider._id)).take(500)
      : [];
    const ratingCount = rider.ratingCount ?? legacyRatings.length;
    const ratingTotal = rider.ratingTotal ?? legacyRatings.reduce((sum: number, rating: any) => sum + rating.stars, 0);
    const createdAt = Date.now();
    await ctx.db.insert("rideRatings", {
      rideId: ride._id,
      customerId: customer._id,
      riderId: ride.riderId,
      stars: args.stars,
      comment: comment || undefined,
      createdAt,
    });
    await ctx.db.patch(ride._id, { ratingSubmittedAt: createdAt });
    await ctx.db.patch(rider._id, {
      ratingCount: ratingCount + 1,
      ratingTotal: ratingTotal + args.stars,
    });
    return null;
  },
});
export const listMyRideRatings = query({
  args: {},
  returns: v.array(v.object({ rideId: v.id("rides"), stars: v.number(), comment: v.optional(v.string()), createdAt: v.number() })),
  handler: async (ctx) => {
    const customer = await currentUser(ctx);
    if (customer.role !== "student") throw new Error("Customer access required");
    const ratings = await ctx.db.query("rideRatings")
      .withIndex("by_customer", (q: any) => q.eq("customerId", customer._id))
      .order("desc")
      .take(100);
    return ratings.map((rating: any) => ({ rideId: rating.rideId, stars: rating.stars, comment: rating.comment, createdAt: rating.createdAt }));
  },
});
export const getMyRatingSummary = query({
  args: {},
  returns: v.object({ averageRating: v.number(), ratingCount: v.number() }),
  handler: async (ctx) => {
    const rider = await currentUser(ctx);
    if (rider.role !== "rider") throw new Error("Rider access required");
    const legacyRatings = rider.ratingCount === undefined
      ? await ctx.db.query("rideRatings").withIndex("by_rider", (q: any) => q.eq("riderId", rider._id)).take(500)
      : [];
    const ratingCount = rider.ratingCount ?? legacyRatings.length;
    const ratingTotal = rider.ratingTotal ?? legacyRatings.reduce((sum: number, rating: any) => sum + rating.stars, 0);
    const averageRating = ratingCount ? Math.round(ratingTotal / ratingCount * 10) / 10 : 0;
    return { averageRating, ratingCount };
  },
});
export const listAdminCompletionRides = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("rides"), status: rideStatusValidator, destinationLabel: v.optional(v.string()),
    fare: v.number(),
    paymentStatus: v.optional(v.union(v.literal("pending"), v.literal("paid"), v.literal("failed"), v.literal("cancelled"), v.literal("processing"))),
    riderName: v.optional(v.string()), studentName: v.optional(v.string()),
    confirmedByName: v.optional(v.string()),
    completionRequestedAt: v.optional(v.number()), completionConfirmedAt: v.optional(v.number()),
    disputeReason: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const rides = [
      ...(await ctx.db.query("rides").withIndex("by_status", (q: any) => q.eq("status", "awaiting_confirmation")).take(100)),
      ...(await ctx.db.query("rides").withIndex("by_status", (q: any) => q.eq("status", "completed")).take(100)),
      ...(await ctx.db.query("rides").withIndex("by_status", (q: any) => q.eq("status", "disputed")).take(100)),
    ];
    return Promise.all(rides.filter((ride: any) => ["awaiting_confirmation", "completed", "disputed"].includes(ride.status)).map(async (ride: any) => {
      const rider: any = ride.riderId ? await ctx.db.get(ride.riderId) : null;
      const student: any = await ctx.db.get(ride.userId);
      const confirmer: any = ride.completionConfirmedBy ? await ctx.db.get(ride.completionConfirmedBy) : null;
      return { _id: ride._id, status: ride.status, destinationLabel: ride.destinationLabel, fare: ride.agreedFare ?? ride.fare ?? 0, paymentStatus: ride.paymentStatus, riderName: rider?.name, studentName: student?.name, confirmedByName: confirmer?.name, completionRequestedAt: ride.completionRequestedAt, completionConfirmedAt: ride.completionConfirmedAt, disputeReason: ride.disputeReason };
    }));
  },
});
export const acceptRide = mutation({
  args: { rideId: v.id("rides") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await currentUser(ctx);
    if (current.role !== "rider")
      throw new Error("Only riders can accept rides");
    if (current.activeRideId) throw new Error("Complete your current ride before accepting another request");
    if (current.verificationStatus !== "approved")
      throw new Error("Account Verification Required");
    if (current.isOnline !== true)
      throw new Error("Go online before accepting rides");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.status !== "requested")
      throw new Error("Ride is no longer available");
    if (requestExpiration(ride) <= Date.now()) {
      if (ride.requestStatus) throw new Error("This ride request has expired");
      await settleRideCancellation(ctx, { _id: ride.userId, role: "student" }, ride, false, "request_expired");
      return null;
    }
    if (ride.riderId && ride.riderId !== current._id)
      throw new Error("This ride is assigned to another rider");
    if (ride.requestStatus) {
      throw new Error("Submit a price offer; the customer must select it before the ride is booked");
    }
    const student = await ctx.db.get(ride.userId);
    if (!student || student.role !== "student") throw new Error("Student account not found");
    const studentRides = await ctx.db.query("rides")
      .withIndex("by_user", (q: any) => q.eq("userId", student._id))
      .order("desc")
      .take(100);
    if (studentRides.some((other: any) =>
      other._id !== ride._id && ["negotiating", "accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(other.status),
    )) {
      throw new Error("The student already has another accepted ride in progress");
    }
    const riderRides = await ctx.db.query("rides")
      .withIndex("by_rider", (q: any) => q.eq("riderId", current._id))
      .order("desc")
      .take(50);
    if (riderRides.some((other: any) =>
      other._id !== ride._id && ["accepted", "rider_arriving", "in_progress", "awaiting_confirmation"].includes(other.status),
    )) {
      throw new Error("Complete your current ride before accepting another request");
    }
    await holdRidePayment(ctx, student, ride, current._id);
    const acceptedAt = Date.now();
    await ctx.db.patch(current._id, { activeRideId: ride._id });
    await ctx.db.patch(args.rideId, {
      status: "accepted",
      riderId: current._id,
      acceptedAt,
      paymentStatus: "paid",
    });
    for (const competingRide of studentRides) {
      if (competingRide._id !== ride._id && ["requested", "negotiating", "offer_made"].includes(competingRide.status)) {
        await settleRideCancellation(
          ctx,
          current,
          competingRide,
          false,
          "another_request_accepted",
        );
      }
    }
    return null;
  },
});
export const declineRide = mutation({
  args: { rideId: v.id("rides") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await currentUser(ctx);
    if (current.role !== "rider") throw new Error("Only riders can decline rides");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.status !== "requested") throw new Error("Ride is no longer available");
    if (ride.riderId && ride.riderId !== current._id)
      throw new Error("This ride is assigned to another rider");
    const existing = await ctx.db
      .query("declinedRides")
      .withIndex("by_rider", (q: any) => q.eq("riderId", current._id))
      .take(100);
    if (!existing.some((item: any) => item.rideId === args.rideId)) {
      await ctx.db.insert("declinedRides", {
        riderId: current._id,
        rideId: args.rideId,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});
export const updateStatus = mutation({
  args: { rideId: v.id("rides"), status: rideStatusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await currentUser(ctx);
    if (current.role !== "student" && current.role !== "rider") {
      throw new Error("Ride status updates require a customer or assigned rider");
    }
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");
    if (args.status === "completed" && current.role !== "rider")
      throw new Error("Only riders can complete rides");
    if (current.role === "rider" && ride.riderId !== current._id)
      throw new Error("This ride belongs to another rider");
    if (current.role === "student" && ride.userId !== current._id)
      throw new Error("This ride belongs to another student");
    if (current.role === "student" && args.status !== "cancelled")
      throw new Error("Students cannot change this ride status");
    if (ride.requestStatus === "booked" &&
      ["rider_arriving", "in_progress", "awaiting_confirmation"].includes(args.status) &&
      ride.paymentStatus !== "paid") {
      throw new Error("Customer payment must be confirmed before the ride can proceed");
    }
    const allowedTransitions: Record<string, string[]> = {
      requested: ["cancelled", "accepted"],
      negotiating: ["cancelled"],
      offer_made: ["cancelled"],
      accepted: ["rider_arriving", "cancelled"],
      rider_arriving: ["in_progress", "cancelled"],
      in_progress: ["awaiting_confirmation", "cancelled"],
      awaiting_confirmation: [],
      completed: [],
      cancelled: [],
      disputed: [],
      expired: [],
    };
    if (args.status === "cancelled" && ride.status === "cancelled") return null;
    if (!allowedTransitions[ride.status]?.includes(args.status))
      throw new Error("Invalid ride status transition");
    if (args.status === "cancelled") {
      const isArrivalTimeout = current.role === "student" && isRiderArrivalTimeoutEligible(ride);
      return settleRideCancellation(
        ctx,
        current,
        ride,
        current.role === "student" && !["requested", "negotiating", "offer_made"].includes(ride.status) && !isArrivalTimeout,
        isArrivalTimeout ? "rider_arrival_timeout" : undefined,
      );
    }
    if (args.status === "awaiting_confirmation" && ["awaiting_confirmation", "completed"].includes(ride.status)) return null;
    if (ride.status === "completed") return null;
    if (args.status === "awaiting_confirmation") {
      if (ride.riderId !== current._id)
        throw new Error("Only the assigned rider can complete this ride");
      if (ride.paymentStatus !== "paid")
        throw new Error("Ride payment must be confirmed before completion");
    }
    const payment = args.status === "awaiting_confirmation"
      ? await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).first()
      : null;
    if (args.status === "awaiting_confirmation" && (!payment || payment.status !== "paid"))
      throw new Error("Confirmed A9 payment ledger record not found");
    await ctx.db.patch(args.rideId, {
      status: args.status,
      completionRequestedAt: args.status === "awaiting_confirmation" ? Date.now() : ride.completionRequestedAt,
    });
    if (payment) await ctx.db.patch(payment._id, { paymentStage: "awaiting_completion" });
    const statusMessages: Record<string, { title: string; body: string }> = {
      rider_arriving: { title: "Your rider is on the way", body: "Your rider has started heading to the pickup location." },
      in_progress: { title: "Ride started", body: "Your ride is now in progress." },
      awaiting_confirmation: { title: "Ride completed by rider", body: "Confirm the ride completion when you have arrived." },
    };
    const statusMessage = statusMessages[args.status];
    if (statusMessage && ride.riderId) {
      const recipientId = current._id === ride.userId ? ride.riderId : ride.userId;
      await ctx.db.insert("notifications", {
        userId: recipientId,
        type: "ride_status",
        title: statusMessage.title,
        body: statusMessage.body,
        rideId: ride._id,
        destination: "dashboard",
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

export const confirmRideCompletion = mutation({
  args: { rideId: v.id("rides") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const student = await currentUser(ctx);
    if (student.role !== "student") throw new Error("Only students can confirm rides");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== student._id) throw new Error("This ride belongs to another student");
    if (ride.status === "completed") return null;
    if (ride.status !== "awaiting_confirmation") throw new Error("Ride is not awaiting confirmation");
    if (!ride.riderId || ride.paymentStatus !== "paid") throw new Error("Ride is not eligible for confirmation");
    const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).unique();
    if (!payment || payment.status !== "paid" || payment.ledgerStatus !== "held" || payment.amount !== ride.fare) {
      throw new Error("Ride payment is not held for settlement");
    }
    const existingEarning = await ctx.db.query("riderEarnings").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).unique();
    const confirmedAt = Date.now();
    if (existingEarning) {
      await ctx.db.patch(existingEarning._id, { status: "eligible", completedAt: confirmedAt, grossFare: ride.fare, riderEarnings: ride.fare, paymentId: payment._id });
    } else {
      await ctx.db.insert("riderEarnings", {
        riderId: ride.riderId, rideId: ride._id, paymentId: payment._id, grossFare: ride.fare,
        platformFee: 0, riderEarnings: ride.fare, currency: "NGN", status: "eligible",
        createdAt: confirmedAt, completedAt: confirmedAt,
      });
    }
    const paymentLedger = await ctx.db.query("financialLedger")
      .withIndex("by_payment", (q: any) => q.eq("paymentId", payment._id))
      .take(20);
    const holdEntry = paymentLedger.find((entry: any) => entry.kind === "payment_pool_hold");
    if (holdEntry) await ctx.db.patch(holdEntry._id, { status: "released" });
    const ridePaymentEntry = paymentLedger.find((entry: any) => entry.kind === "ride_payment");
    if (ridePaymentEntry) await ctx.db.patch(ridePaymentEntry._id, { status: "settled" });
    const earningEntry = paymentLedger.find((entry: any) => entry.kind === "rider_earnings");
    if (!earningEntry) {
      await ctx.db.insert("financialLedger", {
        kind: "rider_earnings",
        direction: "credit",
        riderId: ride.riderId,
        rideId: ride._id,
        paymentId: payment._id,
        amount: ride.fare,
        currency: "NGN",
        reference: `A9-EARNINGS-${String(ride._id)}`,
        status: "eligible",
        createdAt: confirmedAt,
      });
    }
    await ctx.db.patch(payment._id, {
      paymentStage: "eligible_for_rider",
      completionAt: confirmedAt,
      releaseAt: confirmedAt,
      payoutStatus: undefined,
      ledgerStatus: "released",
    });
    await ctx.db.patch(ride._id, { status: "completed", completedAt: confirmedAt, completionConfirmedAt: confirmedAt, completionConfirmedBy: student._id });
    const rider = await ctx.db.get(ride.riderId);
    if (rider?.activeRideId === ride._id) await ctx.db.patch(rider._id, { activeRideId: undefined });
    await ctx.db.insert("auditEvents", { category: "ride", action: "ride_completed", status: "completed", actorId: student._id, riderId: ride.riderId, rideId: ride._id, paymentId: payment._id, createdAt: confirmedAt });
    await ctx.db.insert("auditEvents", { category: "financial", action: "ride_payment_settled", status: "released_to_rider_earnings", actorId: student._id, riderId: ride.riderId, rideId: ride._id, paymentId: payment._id, reason: `${ride.fare} NGN released from A9 held payment to rider earnings`, createdAt: confirmedAt });
    return null;
  },
});

export const reportRideIssue = mutation({
  args: { rideId: v.id("rides"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const student = await currentUser(ctx);
    if (student.role !== "student") throw new Error("Only students can report ride issues");
    const reason = args.reason.trim();
    if (!reason) throw new Error("Describe the issue before submitting");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== student._id) throw new Error("This ride belongs to another student");
    if (ride.status !== "awaiting_confirmation") throw new Error("Ride is not awaiting confirmation");
    const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).first();
    if (payment) await ctx.db.patch(payment._id, { paymentStage: "disputed" });
    const payout = await ctx.db.query("payouts").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).first();
    if (payout && payout.status !== "paid") await ctx.db.patch(payout._id, { status: "review", reviewReason: reason, failureReason: reason });
    await ctx.db.patch(ride._id, { status: "disputed", disputeReportedAt: Date.now(), disputeReportedBy: student._id, disputeReason: reason });
    await ctx.db.insert("auditEvents", { category: "ride", action: "ride_disputed", status: "review", actorId: student._id, rideId: ride._id, paymentId: payment?._id, payoutId: payout?._id, reason, createdAt: Date.now() });
    return null;
  },
});
