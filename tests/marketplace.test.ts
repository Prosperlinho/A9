import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const users = await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("users", {
      name: "Customer",
      role: "student",
      walletBalance: 1000,
    });
    const secondCustomerId = await ctx.db.insert("users", {
      name: "Other customer",
      role: "student",
      walletBalance: 1000,
    });
    const riderId = await ctx.db.insert("users", {
      name: "Rider One",
      role: "rider",
      walletBalance: 0,
      verificationStatus: "approved",
      isOnline: true,
    });
    const secondRiderId = await ctx.db.insert("users", {
      name: "Rider Two",
      role: "rider",
      walletBalance: 0,
      verificationStatus: "approved",
      isOnline: true,
    });
    const unverifiedRiderId = await ctx.db.insert("users", {
      name: "Unverified rider",
      role: "rider",
      walletBalance: 0,
      verificationStatus: "under_review",
      isOnline: false,
    });
    const pickupId = await ctx.db.insert("locations", {
      slug: "greenhouse",
      name: "Greenhouse",
      group: "backgate",
      detail: "Greenhouse",
      active: true,
      latitude: 6.297,
      longitude: 8.101,
    });
    const destinationId = await ctx.db.insert("locations", {
      slug: "school-clinic",
      name: "School Clinic",
      group: "school-area",
      detail: "School Clinic",
      active: true,
      latitude: 6.3,
      longitude: 8.104,
    });
    return { customerId, secondCustomerId, riderId, secondRiderId, unverifiedRiderId, pickupId, destinationId };
  });

  return {
    ...users,
    t,
    customer: t.withIdentity({ subject: String(users.customerId) }),
    otherCustomer: t.withIdentity({ subject: String(users.secondCustomerId) }),
    rider: t.withIdentity({ subject: String(users.riderId) }),
    secondRider: t.withIdentity({ subject: String(users.secondRiderId) }),
    unverifiedRider: t.withIdentity({ subject: String(users.unverifiedRiderId) }),
  };
}

describe("marketplace ride requests and offers", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("returns expired rides in customer history without rejecting the status", async () => {
    const { customer, t, customerId } = await setup();
    const rideId = await t.run((ctx) => ctx.db.insert("rides", {
      userId: customerId,
      fare: 250,
      status: "expired",
      requestedAt: Date.now(),
    }));

    await expect(customer.query(api.rides.listMyRides, {})).resolves.toEqual([
      expect.objectContaining({ _id: rideId, status: "expired", paymentStatus: "pending" }),
    ]);
  });

  it("accepts legacy offer_made rides with optional distance and fare fields", async () => {
    const { customer, customerId } = await setup();
    const rideId = await customer.run((ctx) => ctx.db.insert("rides", {
      userId: customerId,
      status: "offer_made",
      requestedAt: Date.now(),
      distance: 1,
      estimatedFare: 250,
      offeredFare: 250,
      agreedFare: 250,
    }));

    await expect(customer.query(api.rides.listMyRides, {})).resolves.toEqual([
      expect.objectContaining({ _id: rideId, status: "offer_made", offeredFare: 250, agreedFare: 250 }),
    ]);
  });

  it("allows a passenger to cancel a legacy offer_made ride", async () => {
    const { customer, customerId, t } = await setup();
    const rideId = await t.run((ctx) => ctx.db.insert("rides", {
      userId: customerId,
      status: "offer_made",
      requestedAt: Date.now(),
    }));

    await customer.mutation(api.rides.cancelRide, { rideId });

    await expect(t.run((ctx) => ctx.db.get(rideId))).resolves.toMatchObject({ status: "cancelled" });
  });

  it("creates an idempotent customer request and notifies eligible riders", async () => {
    const { customer, pickupId, destinationId, riderId, t } = await setup();
    const firstRideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-one",
    });
    const repeatedRideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-one",
    });
    expect(repeatedRideId).toBe(firstRideId);
    const ride = await t.run((ctx) => ctx.db.get(firstRideId));
    expect(ride).toMatchObject({ status: "requested", requestStatus: "searching", paymentStatus: "pending" });
    const notifications = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notifications.filter((item) => item.userId === riderId && item.type === "ride_request")).toHaveLength(1);
  });

  it("creates unpriced nationwide ride requests without distance estimates", async () => {
    const { customer, t } = await setup();
    const rideId = await customer.mutation(api.rides.createRide, {
      pickup: { name: "12 Broad Street", city: "Lagos", state: "Lagos" },
      destination: { name: "Waterfront", city: "Port Harcourt", state: "Rivers" },
      bookingReference: "booking-nationwide",
    });
    const ride = await t.run((ctx) => ctx.db.get(rideId));
    expect(ride).toMatchObject({
      pickupLabel: "12 Broad Street, Lagos, Lagos",
      pickupCity: "Lagos",
      pickupState: "Lagos",
      destinationLabel: "Waterfront, Port Harcourt, Rivers",
      destinationCity: "Port Harcourt",
      destinationState: "Rivers",
    });
    expect(ride?.fare).toBeUndefined();
    expect(ride).not.toHaveProperty("distanceKm");
    expect(Object.values(ride ?? {}).every((value) => value !== undefined)).toBe(true);
  });

  it("creates name-and-coordinate location requests and supplies safe legacy query defaults", async () => {
    const { customer } = await setup();
    const rideId = await customer.mutation(api.rides.createRide, {
      pickup: { name: "Central Market", lat: 6.45, lng: 3.39 },
      destination: { name: "City Hall", lat: 6.46, lng: 3.4 },
      bookingReference: "booking-name-coordinates",
    });
    const rides = await customer.query(api.rides.listMyRides, {});

    expect(rides).toEqual([
      expect.objectContaining({
        _id: rideId,
        pickupLabel: "Central Market",
        destinationLabel: "City Hall",
        distance: 1,
        estimatedFare: 250,
      }),
    ]);
  });

  it("negotiates counter-offers and atomically locks the accepted fare in escrow", async () => {
    const { customer, rider, customerId, riderId, pickupId, destinationId, t } = await setup();
    const rideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-negotiation-room",
    });
    await rider.mutation(api.rides.startNegotiation, { rideId });
    const negotiatingRide = await t.run((ctx) => ctx.db.get(rideId));
    expect(negotiatingRide).toMatchObject({ status: "negotiating", riderId });
    expect(negotiatingRide?.fare).toBeUndefined();
    await rider.mutation(api.rides.submitPriceOffer, { rideId, proposedPrice: 600 });
    await customer.mutation(api.rides.submitPriceOffer, { rideId, proposedPrice: 500 });
    await expect(customer.mutation(api.rides.acceptFinalPriceAndLock, { rideId, agreedFare: 500 }))
      .rejects.toThrow("rider must accept your counter-offer");
    await rider.mutation(api.rides.submitPriceOffer, { rideId, proposedPrice: 500 });
    await customer.mutation(api.rides.acceptFinalPriceAndLock, { rideId, agreedFare: 500 });

    const ride = await t.run((ctx) => ctx.db.get(rideId));
    const customerRecord = await t.run((ctx) => ctx.db.get(customerId));
    const riderRecord = await t.run((ctx) => ctx.db.get(riderId));
    const payment = await t.run((ctx) => ctx.db.query("payments").withIndex("by_ride", (q) => q.eq("rideId", rideId)).unique());
    expect(ride).toMatchObject({ status: "accepted", fare: 500, agreedFare: 500, paymentStatus: "paid" });
    expect(customerRecord?.walletBalance).toBe(500);
    expect(riderRecord?.activeRideId).toBe(rideId);
    expect(payment).toMatchObject({ amount: 500, status: "paid", ledgerStatus: "held", method: "wallet" });
  });

  it("does not lock a negotiated fare when the passenger wallet is insufficient", async () => {
    const { customer, rider, customerId, pickupId, destinationId, t } = await setup();
    await t.run((ctx) => ctx.db.patch(customerId, { walletBalance: 300 }));
    const rideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-negotiation-insufficient-funds",
    });
    await rider.mutation(api.rides.startNegotiation, { rideId });
    await rider.mutation(api.rides.submitPriceOffer, { rideId, proposedPrice: 500 });

    await expect(customer.mutation(api.rides.acceptFinalPriceAndLock, { rideId, agreedFare: 500 }))
      .rejects.toThrow("Insufficient wallet balance");
    const ride = await t.run((ctx) => ctx.db.get(rideId));
    const customerRecord = await t.run((ctx) => ctx.db.get(customerId));
    expect(ride).toMatchObject({ status: "negotiating", proposedPrice: 500 });
    expect(ride?.fare).toBeUndefined();
    expect(customerRecord?.walletBalance).toBe(300);
    await expect(t.run((ctx) => ctx.db.query("payments").withIndex("by_ride", (q) => q.eq("rideId", rideId)).unique()))
      .resolves.toBeNull();
  });

  it("rejects out-of-range coordinates instead of using the distance fallback", async () => {
    const { customer } = await setup();
    await expect(customer.mutation(api.rides.createRide, {
      pickup: { name: "Invalid point", city: "Lagos", state: "Lagos", lat: 91, lng: 3 },
      destination: { name: "Other point", city: "Lagos", state: "Lagos" },
      bookingReference: "booking-invalid-coordinate",
    })).rejects.toThrow("coordinates are invalid");
  });

  it("lets customers cancel a negotiating ride and closes competing offers", async () => {
    const { customer, rider, pickupId, destinationId, t } = await setup();
    const rideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-cancel-offer",
    });
    const offerId = await rider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 450 });

    await customer.mutation(api.rides.cancelRide, { rideId });

    const ride = await t.run((ctx) => ctx.db.get(rideId));
    const offer = await t.run((ctx) => ctx.db.get(offerId));
    expect(ride).toMatchObject({ status: "cancelled" });
    expect(offer).toMatchObject({ status: "closed" });
  });

  it("allows an eligible rider to submit one offer and rejects duplicate submissions", async () => {
    const { customer, rider, pickupId, destinationId, t } = await setup();
    const rideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-offer",
    });
    const offerId = await rider.mutation(api.marketplace.submitRiderOffer, { rideId, proposedPrice: 450 });
    expect(offerId).toBeTruthy();
    const ride = await t.run((ctx) => ctx.db.get(rideId));
    expect(ride).toMatchObject({ status: "negotiating", requestStatus: "offers_available" });
    await expect(rider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 500 })).rejects.toThrow("already submitted");
  });

  it("lets a customer decline an individual rider price offer", async () => {
    const { customer, rider, pickupId, destinationId, t } = await setup();
    const rideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-decline-offer",
    });
    const offerId = await rider.mutation(api.marketplace.submitRiderOffer, { rideId, proposedPrice: 450 });
    const result = await customer.mutation(api.marketplace.declineRideOffer, { rideId, offerId });
    expect(result.success).toBe(true);
    const offers = await t.run((ctx) =>
      ctx.db.query("rideOffers").withIndex("by_ride", (q) => q.eq("rideId", rideId)).collect(),
    );
    expect(offers[0].status).toBe("rejected");
  });

  it("blocks unverified riders from going online or submitting offers", async () => {
    const { unverifiedRider, customer, pickupId, destinationId } = await setup();
    const rideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-unverified",
    });
    await expect(unverifiedRider.mutation(api.users.setRiderAvailability, { isOnline: true })).rejects.toThrow("Verification");
    await expect(unverifiedRider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 500 })).rejects.toThrow("Verification");
  });

  it("restricts offer selection and cancellation to the request owner", async () => {
    const { customer, otherCustomer, rider, pickupId, destinationId } = await setup();
    const rideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-owner",
    });
    const offerId = await rider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 475 });
    await expect(otherCustomer.mutation(api.marketplace.selectRideOffer, { rideId, offerId })).rejects.toThrow("access denied");
    await expect(otherCustomer.mutation(api.rides.cancelRide, { rideId })).rejects.toThrow("belongs to another");
  });

  it("rejects offers for invalid, cancelled, expired, or already-assigned requests", async () => {
    const { customer, rider, secondRiderId, pickupId, destinationId, t } = await setup();
    const rideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-status",
    });
    await expect(rider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 249 })).rejects.toThrow("whole-number");

    await t.run(async (ctx) => {
      await ctx.db.patch(rideId, { requestStatus: "cancelled" });
    });
    await expect(rider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 500 })).rejects.toThrow("no longer accepting");

    await t.run(async (ctx) => {
      await ctx.db.patch(rideId, { requestStatus: "searching", expiresAt: Date.now() - 1 });
    });
    await expect(rider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 500 })).rejects.toThrow("expired");

    await t.run(async (ctx) => {
      await ctx.db.patch(rideId, { expiresAt: Date.now() + 60_000, riderId: secondRiderId });
    });
    await expect(rider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 500 })).rejects.toThrow("no longer accepting");
  });

  it("locks the selected stored fare in wallet escrow and rejects a competing offer", async () => {
    const { customer, rider, secondRider, customerId, pickupId, destinationId, t } = await setup();
    const rideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-race",
    });
    const firstOffer = await rider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 500 });
    const secondOffer = await secondRider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 600 });

    const winner = await customer.mutation(api.marketplace.confirmRideOffer, { rideId, offerId: firstOffer });
    const loser = await customer.mutation(api.marketplace.selectRideOffer, { rideId, offerId: secondOffer });
    expect(winner.success).toBe(true);
    expect(loser.success).toBe(false);
    const ride = await t.run((ctx) => ctx.db.get(rideId));
    expect(ride).toMatchObject({
      riderId: expect.any(String),
      fare: 500,
      offeredFare: 500,
      agreedFare: 500,
      status: "accepted",
      requestStatus: "booked",
      paymentStatus: "paid",
    });
    const customerRecord = await t.run((ctx) => ctx.db.get(customerId));
    expect(customerRecord?.walletBalance).toBe(500);
    const payments = await t.run((ctx) =>
      ctx.db.query("payments").withIndex("by_ride", (q) => q.eq("rideId", rideId)).collect(),
    );
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amount: 500, status: "paid", method: "wallet", ledgerStatus: "held" });
    await expect(rider.mutation(api.marketplace.selectRideOffer, { rideId, offerId: secondOffer })).rejects.toThrow();
  });

  it("does not accept an offer when the customer cannot fund escrow", async () => {
    const { customer, rider, customerId, pickupId, destinationId, t } = await setup();
    await t.run((ctx) => ctx.db.patch(customerId, { walletBalance: 300 }));
    const rideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-insufficient-escrow",
    });
    const offerId = await rider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 500 });
    await expect(
      customer.mutation(api.marketplace.confirmRideOffer, { rideId, offerId }),
    ).rejects.toThrow("Insufficient wallet balance");
    const ride = await t.run((ctx) => ctx.db.get(rideId));
    expect(ride).toMatchObject({ status: "negotiating", requestStatus: "offers_available" });
    const customerRecord = await t.run((ctx) => ctx.db.get(customerId));
    expect(customerRecord?.walletBalance).toBe(300);
    const transactions = await t.run((ctx) => ctx.db.query("walletTransactions").collect());
    expect(transactions).toHaveLength(0);
  });

  it("expires requests, closes offers, and notifies customer and riders", async () => {
    const { customer, rider, pickupId, destinationId, riderId, t } = await setup();
    const rideId = await customer.mutation(api.rides.createRide, {
      pickupLocationId: pickupId,
      destinationLocationId: destinationId,
      bookingReference: "booking-expire",
    });
    const offerId = await rider.mutation(api.marketplace.submitRideOffer, { rideId, fare: 550 });
    await t.run(async (ctx) => {
      await ctx.db.patch(rideId, { expiresAt: Date.now() - 1 });
    });
    await t.mutation(internal.rides.expireRideRequest, { rideId });
    const ride = await t.run((ctx) => ctx.db.get(rideId));
    const offer = await t.run(async (ctx) =>
      (await ctx.db.query("rideOffers").withIndex("by_ride", (q) => q.eq("rideId", rideId)).collect())
        .find((item) => item._id === offerId),
    );
    expect(ride).toMatchObject({ status: "cancelled", requestStatus: "expired" });
    expect(offer?.status).toBe("closed");
    const notifications = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notifications.some((item) => item.userId === riderId && item.type === "ride_expired")).toBe(true);
    expect(notifications.some((item) => item.type === "ride_expired" && item.rideId === rideId)).toBe(true);
  });
});
