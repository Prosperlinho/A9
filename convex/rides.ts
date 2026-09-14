import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

const rideStatusValidator = v.union(
  v.literal("requested"),
  v.literal("accepted"),
  v.literal("rider_arriving"),
  v.literal("in_progress"),
  v.literal("awaiting_confirmation"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("disputed"),
);
const schoolLocations = [
  ["backgate", "Backgate"], ["legal-unit", "Legal Unit"], ["convo", "Convo"],
  ["physical-science", "Physical Science"], ["education", "Education"], ["humanities", "Humanities"],
  ["temp-site", "Temp Site"], ["c-block", "C-Block"], ["perm-site", "Perm Site"],
  ["new-girls-hostel", "New Girls Hostel"], ["old-girls-hostel", "Old Girls Hostel"], ["boys-hostel", "Boys Hostel"],
  ["theatre-art", "Theatre Art"], ["up-jesus-lodge", "Up Jesus Lodge"], ["excellent-lodge", "Excellent Lodge"],
  ["emmanuel-god-with-us", "Emmanuel God With Us"], ["lakass", "Lakass"], ["maingate", "Maingate"],
  ["nwabuking", "Nwabuking"], ["amazing-grace", "Amazing Grace"], ["kloud-9", "Kloud 9"], ["native", "Native"],
  ["school-clinic", "School Clinic"], ["bursary", "Bursary"], ["jubilation-lodge", "Jubilation Lodge"], ["gas-plant", "Gas Plant"],
] as const;
const rideReturn = v.object({
  _id: v.id("rides"),
  userId: v.id("users"),
  riderId: v.optional(v.id("users")),
  pickupLocationId: v.optional(v.id("locations")),
  destinationLocationId: v.optional(v.id("locations")),
  pickupLabel: v.optional(v.string()),
  destinationLabel: v.optional(v.string()),
  pickupLatitude: v.optional(v.number()),
  pickupLongitude: v.optional(v.number()),
  destinationLatitude: v.optional(v.number()),
  destinationLongitude: v.optional(v.number()),
  fare: v.number(),
  paymentStatus: v.optional(v.union(v.literal("pending"), v.literal("paid"), v.literal("failed"), v.literal("cancelled"), v.literal("processing"))),
  paymentStage: v.optional(v.union(v.literal("unpaid"), v.literal("paid_held"), v.literal("awaiting_completion"), v.literal("eligible_for_rider"), v.literal("pending_payout"), v.literal("paid_to_rider"), v.literal("refunded"), v.literal("disputed"))),
  paymentAmount: v.optional(v.number()),
  studentName: v.optional(v.string()),
  status: rideStatusValidator,
  requestedAt: v.number(),
  completionRequestedAt: v.optional(v.number()),
  completionConfirmedAt: v.optional(v.number()),
  completionConfirmedBy: v.optional(v.id("users")),
  disputeReportedAt: v.optional(v.number()),
  disputeReportedBy: v.optional(v.id("users")),
  disputeReason: v.optional(v.string()),
});
const rideFields = (ride: any) => ({
  _id: ride._id,
  userId: ride.userId,
  riderId: ride.riderId,
  pickupLocationId: ride.pickupLocationId,
  destinationLocationId: ride.destinationLocationId,
  pickupLabel: ride.pickupLabel,
  destinationLabel: ride.destinationLabel,
  pickupLatitude: ride.pickupLatitude,
  pickupLongitude: ride.pickupLongitude,
  destinationLatitude: ride.destinationLatitude,
  destinationLongitude: ride.destinationLongitude,
  fare: ride.fare,
  paymentStatus: ride.paymentStatus,
  paymentStage: undefined,
  paymentAmount: undefined,
  studentName: undefined,
  status: ride.status,
  requestedAt: ride.requestedAt,
  completionRequestedAt: ride.completionRequestedAt,
  completionConfirmedAt: ride.completionConfirmedAt,
  completionConfirmedBy: ride.completionConfirmedBy,
  disputeReportedAt: ride.disputeReportedAt,
  disputeReportedBy: ride.disputeReportedBy,
  disputeReason: ride.disputeReason,
});
async function rideFieldsWithPayment(ctx: any, ride: any) {
  const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).first();
  const student = await ctx.db.get(ride.userId);
  const paymentStatus = payment?.status ?? ride.paymentStatus ?? "pending";
  const paymentStage = payment?.paymentStage ?? ride.paymentStage ?? (paymentStatus === "paid" ? "paid_held" : "unpaid");
  return {
    ...rideFields(ride),
    paymentStatus,
    paymentStage,
    paymentAmount: payment?.amount ?? ride.paymentAmount ?? ride.fare,
    studentName: student?.name,
  };
}
async function currentUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in required");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Account profile not found");
  return user;
}

export const listLocations = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("locations"),
      name: v.string(),
      slug: v.optional(v.string()),
      detail: v.string(),
      active: v.boolean(),
      latitude: v.optional(v.number()),
      longitude: v.optional(v.number()),
      countryCode: v.optional(v.string()),
      state: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("locations")
        .withIndex("by_active", (q: any) => q.eq("active", true))
        .take(100)
    ).map((item: any) => ({
      _id: item._id,
      slug: item.slug,
      name: item.name,
      detail: item.detail,
      active: item.active,
      latitude: item.latitude,
      longitude: item.longitude,
      countryCode: item.countryCode,
      state: item.state,
    })),
});
export const ensureLocations = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("locations")
      .withIndex("by_active", (q: any) => q.eq("active", true))
      .take(100);
    const existingBySlug = new Map(existing.filter((item: any) => item.slug).map((item: any) => [item.slug, item]));
    for (const [index, [slug, name]] of schoolLocations.entries()) {
      const current = existingBySlug.get(slug);
      const latitude = 6.297 + (index % 6) * 0.0011;
      const longitude = 8.101 + Math.floor(index / 6) * 0.0011;
      if (current) {
        await ctx.db.patch(current._id, { name, active: true, detail: "AE-FUNAI school location", countryCode: "NG", state: "Ebonyi", latitude, longitude });
      } else {
        await ctx.db.insert("locations", { slug, name, detail: "AE-FUNAI school location", active: true, latitude, longitude, countryCode: "NG", state: "Ebonyi" });
      }
    }
    return null;
  },
});
export const listSchoolLocations = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("locations"), slug: v.string(), name: v.string(), detail: v.string(), active: v.boolean(), latitude: v.optional(v.number()), longitude: v.optional(v.number()), countryCode: v.optional(v.string()), state: v.optional(v.string()) })),
  handler: async (ctx) => (await ctx.db.query("locations").withIndex("by_active", (q: any) => q.eq("active", true)).take(100)).filter((item: any) => item.slug).map((item: any) => ({ _id: item._id, slug: item.slug, name: item.name, detail: item.detail, active: item.active, latitude: item.latitude, longitude: item.longitude, countryCode: item.countryCode, state: item.state })),
});
export const createRide = mutation({
  args: {
    pickupLocationId: v.id("locations"),
    destinationLocationId: v.id("locations"),
    riderId: v.optional(v.id("users")),
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
    if (args.pickupLocationId === args.destinationLocationId) throw new Error("Pickup and destination must be different");
    const pickup = await ctx.db.get(args.pickupLocationId);
    const destination = await ctx.db.get(args.destinationLocationId);
    if (!pickup?.active || !pickup.slug || !destination?.active || !destination.slug) throw new Error("Select valid A9 school locations");
    if (args.riderId) {
      const rider = await ctx.db.get(args.riderId);
      if (!rider || rider.role !== "rider" || rider.isOnline !== true)
        throw new Error("Selected rider is not available");
    }
    const distance = Math.hypot(
      ((destination.latitude ?? 0) - (pickup.latitude ?? 0)) * 111,
      ((destination.longitude ?? 0) - (pickup.longitude ?? 0)) * 111,
    );
    const fare = Math.round(Math.max(250, distance * 70 + 180));
    const availableBalance = current.walletBalance - (current.walletReserved ?? 0);
    if (availableBalance < fare) {
      throw new Error(`Insufficient Balance. You need ${fare.toLocaleString("en-NG")} NGN to book this ride.`);
    }
    const now = Date.now();
    const paymentReference = `A9-WALLET-RIDE-${args.bookingReference}`;
    const rideId = await ctx.db.insert("rides", {
      bookingReference: args.bookingReference,
      pickupLocationId: args.pickupLocationId,
      destinationLocationId: args.destinationLocationId,
      pickupLabel: pickup.name,
      destinationLabel: destination.name,
      pickupLatitude: pickup.latitude,
      pickupLongitude: pickup.longitude,
      destinationLatitude: destination.latitude,
      destinationLongitude: destination.longitude,
      fare,
      riderId: args.riderId,
      paymentStatus: "paid",
      status: "requested",
      userId: current._id,
      requestedAt: now,
      acceptedAt: undefined,
    });
    const paymentId = await ctx.db.insert("payments", {
      rideId,
      studentId: current._id,
      riderId: args.riderId,
      amount: fare,
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
    await ctx.db.patch(current._id, { walletBalance: current.walletBalance - fare });
    await ctx.db.insert("walletTransactions", {
      userId: current._id,
      amount: -fare,
      type: "ride_charge",
      description: "Ride payment held by A9",
      rideId,
      createdAt: now,
      provider: "a9_wallet",
      providerReference: paymentReference,
    });
    await ctx.db.insert("financialLedger", {
      kind: "ride_payment",
      direction: "debit",
      userId: current._id,
      rideId,
      paymentId,
      amount: fare,
      currency: "NGN",
      reference: paymentReference,
      status: "paid_held",
      createdAt: now,
    });
    await ctx.db.insert("financialLedger", {
      kind: "payment_pool_hold",
      direction: "credit",
      userId: current._id,
      rideId,
      paymentId,
      amount: fare,
      currency: "NGN",
      reference: `${paymentReference}-POOL`,
      status: "held",
      createdAt: now,
    });
    return rideId;
  },
});
export const listOpenRides = query({
  args: {},
  returns: v.array(rideReturn),
  handler: async (ctx) => {
    const current = await currentUser(ctx);
    if (current.role !== "rider") return [];
    if (current.isOnline !== true) return [];
    const declined = await ctx.db
      .query("declinedRides")
      .withIndex("by_rider", (q: any) => q.eq("riderId", current._id))
      .take(100);
    const declinedIds = new Set(declined.map((item: any) => item.rideId));
    const rides = (
      await ctx.db
        .query("rides")
        .withIndex("by_status", (q: any) => q.eq("status", "requested"))
        .take(50)
    ).filter((ride: any) =>
      ride.paymentStatus === "paid" &&
      !declinedIds.has(ride._id) &&
      (ride.riderId === undefined || ride.riderId === current._id)
    );
    return Promise.all(rides.map((ride: any) => rideFieldsWithPayment(ctx, ride)));
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
    return Promise.all(rides.map((ride: any) => rideFieldsWithPayment(ctx, ride)));
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
    return Promise.all(rides.map((ride: any) => rideFieldsWithPayment(ctx, ride)));
  },
});
export const listAdminCompletionRides = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("rides"), status: rideStatusValidator, destinationLabel: v.optional(v.string()),
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
      return { _id: ride._id, status: ride.status, destinationLabel: ride.destinationLabel, paymentStatus: ride.paymentStatus, riderName: rider?.name, studentName: student?.name, confirmedByName: confirmer?.name, completionRequestedAt: ride.completionRequestedAt, completionConfirmedAt: ride.completionConfirmedAt, disputeReason: ride.disputeReason };
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
    if (current.verificationStatus !== "approved")
      throw new Error("Account Verification Required");
    if (current.isOnline !== true)
      throw new Error("Go online before accepting rides");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.status !== "requested")
      throw new Error("Ride is no longer available");
    if (ride.paymentStatus !== "paid") throw new Error("Wait for student payment confirmation");
    if (ride.riderId && ride.riderId !== current._id)
      throw new Error("This ride is assigned to another rider");
    await ctx.db.patch(args.rideId, {
      status: "accepted",
      riderId: current._id,
      acceptedAt: Date.now(),
    });
    const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).first();
    if (payment) await ctx.db.patch(payment._id, { riderId: current._id, paymentStage: payment.paymentStage ?? "paid_held" });
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
    const allowedTransitions: Record<string, string[]> = {
      requested: ["cancelled", "accepted"],
      accepted: ["rider_arriving", "cancelled"],
      rider_arriving: ["in_progress", "cancelled"],
      in_progress: ["awaiting_confirmation", "cancelled"],
      awaiting_confirmation: [],
      completed: [],
      cancelled: [],
      disputed: [],
    };
    if (!allowedTransitions[ride.status]?.includes(args.status))
      throw new Error("Invalid ride status transition");
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
    if (ride.status !== "awaiting_confirmation") throw new Error("Ride is not awaiting confirmation");
    if (!ride.riderId || ride.paymentStatus !== "paid") throw new Error("Ride is not eligible for confirmation");
    const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).unique();
    if (!payment || payment.status !== "paid") throw new Error("Verified ride payment not found");
    const existingEarning = await ctx.db.query("riderEarnings").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).unique();
    const confirmedAt = Date.now();
    const earningsId = existingEarning?._id ?? await ctx.db.insert("riderEarnings", {
        riderId: ride.riderId, rideId: ride._id, paymentId: payment._id, grossFare: ride.fare,
        platformFee: 0, riderEarnings: ride.fare, currency: "NGN", status: "eligible",
        createdAt: confirmedAt, completedAt: confirmedAt,
      });
    if (existingEarning) await ctx.db.patch(existingEarning._id, { status: "eligible", completedAt: confirmedAt, grossFare: ride.fare, riderEarnings: ride.fare, paymentId: payment._id });
    const payout = await ctx.db.query("payouts").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).unique();
    if (!payout) await ctx.db.insert("payouts", {
      riderId: ride.riderId, rideId: ride._id, paymentId: payment._id, earningsId,
      amount: ride.fare, currency: "NGN", status: "pending", reference: `A9-PAYOUT-${String(ride._id)}`,
      createdAt: confirmedAt,
    });
    await ctx.db.patch(payment._id, { paymentStage: "eligible_for_rider", completionAt: confirmedAt, releaseAt: confirmedAt, payoutStatus: "pending", ledgerStatus: "released" });
    await ctx.db.insert("financialLedger", { kind: "payment_pool_hold", direction: "debit", riderId: ride.riderId, rideId: ride._id, paymentId: payment._id, amount: ride.fare, currency: "NGN", reference: `${payment.paystackReference}-RELEASE`, status: "released", createdAt: confirmedAt });
    await ctx.db.insert("financialLedger", { kind: "rider_earnings", direction: "credit", riderId: ride.riderId, rideId: ride._id, paymentId: payment._id, amount: ride.fare, currency: "NGN", reference: `A9-EARNINGS-${String(ride._id)}`, status: "pending_payout", createdAt: confirmedAt });
    await ctx.db.patch(ride._id, { status: "completed", completedAt: confirmedAt, completionConfirmedAt: confirmedAt, completionConfirmedBy: student._id });
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
    await ctx.db.patch(ride._id, { status: "disputed", disputeReportedAt: Date.now(), disputeReportedBy: student._id, disputeReason: reason });
    return null;
  },
});
