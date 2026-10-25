import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.*s");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("users", {
      name: "Customer",
      role: "student",
      walletBalance: 1000,
    });
    const riderId = await ctx.db.insert("users", {
      name: "Rider",
      role: "rider",
      walletBalance: 0,
      verificationStatus: "approved",
      isOnline: true,
      payoutBankName: "Test Bank",
      payoutBankCode: "000",
      payoutAccountNumber: "1234567890",
      payoutAccountName: "Test Rider",
    });
    const rideId = await ctx.db.insert("rides", {
      userId: customerId,
      riderId,
      fare: 500,
      status: "accepted",
      requestStatus: "booked",
      paymentStatus: "pending",
      requestedAt: Date.now(),
      acceptedAt: Date.now(),
    });
    return { customerId, riderId, rideId };
  });
  return {
    ...ids,
    t,
    customer: t.withIdentity({ subject: String(ids.customerId) }),
    rider: t.withIdentity({ subject: String(ids.riderId) }),
  };
}

async function seedHeldPayment(t: ReturnType<typeof convexTest>, ids: { customerId: any; riderId: any; rideId: any }, fare = 500) {
  return t.run(async (ctx) => {
    const customer = await ctx.db.get(ids.customerId);
    if (customer) await ctx.db.patch(customer._id, { walletBalance: customer.walletBalance - fare });
    await ctx.db.patch(ids.rideId, { fare, status: "accepted", paymentStatus: "paid", requestStatus: "booked" });
    const paymentId = await ctx.db.insert("payments", {
      rideId: ids.rideId,
      studentId: ids.customerId,
      riderId: ids.riderId,
      amount: fare,
      currency: "NGN",
      paystackReference: `wallet-${String(ids.rideId)}`,
      status: "paid",
      method: "wallet",
      ledgerStatus: "held",
      paymentStage: "paid_held",
      createdAt: Date.now(),
      paidAt: Date.now(),
    });
    await ctx.db.insert("financialLedger", {
      kind: "ride_payment",
      direction: "debit",
      userId: ids.customerId,
      rideId: ids.rideId,
      paymentId,
      amount: fare,
      currency: "NGN",
      reference: `wallet-${String(ids.rideId)}`,
      status: "paid_held",
      createdAt: Date.now(),
    });
    await ctx.db.insert("financialLedger", {
      kind: "payment_pool_hold",
      direction: "credit",
      userId: ids.customerId,
      rideId: ids.rideId,
      paymentId,
      amount: fare,
      currency: "NGN",
      reference: `wallet-${String(ids.rideId)}-POOL`,
      status: "held",
      createdAt: Date.now(),
    });
    return paymentId;
  });
}

describe("ride payments and cancellation accounting", () => {
  it("credits a wallet funding reference once and records a completed transaction", async () => {
    const { t, customerId } = await setup();
    const reference = "A9-WALLET-idempotency";
    await t.run((ctx) => ctx.db.insert("walletFundingRequests", {
      userId: customerId,
      amount: 500,
      currency: "NGN",
      status: "pending",
      provider: "paystack",
      providerReference: reference,
      createdAt: Date.now(),
    }));

    const first = await t.mutation(internal.payments.markFundingVerified, {
      reference,
      amount: 50000,
      currency: "NGN",
    });
    const replay = await t.mutation(internal.payments.markFundingVerified, {
      reference,
      amount: 50000,
      currency: "NGN",
    });

    const customerRecord = await t.run((ctx) => ctx.db.get(customerId));
    const transactions = await t.run((ctx) => ctx.db.query("walletTransactions")
      .withIndex("by_provider_reference", (q) => q.eq("providerReference", reference))
      .collect());
    const ledgerEntries = await t.run((ctx) => ctx.db.query("financialLedger")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .collect());

    expect(first.updated).toBe(true);
    expect(replay.updated).toBe(false);
    expect(customerRecord?.walletBalance).toBe(1500);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      amount: 500,
      type: "top_up",
      status: "completed",
      currency: "NGN",
      providerReference: reference,
    });
    expect(ledgerEntries).toHaveLength(1);
  });

  it("does not credit again when the wallet transaction already has the reference", async () => {
    const { t, customerId } = await setup();
    const reference = "A9-WALLET-existing-transaction";
    await t.run(async (ctx) => {
      await ctx.db.insert("walletFundingRequests", {
        userId: customerId,
        amount: 500,
        currency: "NGN",
        status: "pending",
        provider: "paystack",
        providerReference: reference,
        createdAt: Date.now(),
      });
      await ctx.db.insert("walletTransactions", {
        userId: customerId,
        amount: 500,
        type: "top_up",
        description: "Paystack wallet funding",
        currency: "NGN",
        status: "completed",
        createdAt: Date.now(),
        provider: "paystack",
        providerReference: reference,
      });
    });

    const result = await t.mutation(internal.payments.markFundingVerified, {
      reference,
      amount: 50000,
      currency: "NGN",
    });

    const customerRecord = await t.run((ctx) => ctx.db.get(customerId));
    const funding = await t.run((ctx) => ctx.db.query("walletFundingRequests")
      .withIndex("by_provider_reference", (q) => q.eq("providerReference", reference))
      .unique());
    const transactions = await t.run((ctx) => ctx.db.query("walletTransactions")
      .withIndex("by_provider_reference", (q) => q.eq("providerReference", reference))
      .collect());

    expect(result.updated).toBe(false);
    expect(customerRecord?.walletBalance).toBe(1000);
    expect(funding?.status).toBe("verified");
    expect(transactions).toHaveLength(1);
  });

  it("uses the server-locked offer fare for wallet payment", async () => {
    const { customer, t, rideId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(rideId, { fare: 450 });
    });
    const payment = await customer.mutation(api.payments.payRideFromWallet, { rideId });
    expect(payment).toMatchObject({ amount: 450, status: "paid", method: "wallet" });
    const customerRecord = await t.run((ctx) => ctx.db.get(payment.studentId));
    const ride = await t.run((ctx) => ctx.db.get(rideId));
    expect(customerRecord?.walletBalance).toBe(550);
    expect(ride?.paymentStatus).toBe("paid");
  });

  it("does not create a payment when the wallet balance is insufficient", async () => {
    const { customer, t, rideId, customerId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(customerId, { walletBalance: 100 });
    });
    await expect(customer.mutation(api.payments.payRideFromWallet, { rideId })).rejects.toThrow("Insufficient wallet balance");
    const payments = await t.run((ctx) => ctx.db.query("payments").collect());
    expect(payments).toHaveLength(0);
  });

  it.each(["cancelled", "completed"] as const)("does not pay a %s ride", async (status) => {
    const { customer, t, rideId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(rideId, { status });
    });
    await expect(customer.mutation(api.payments.payRideFromWallet, { rideId })).rejects.toThrow("no longer eligible");
  });

  it("does not reuse a failed Paystack payment for a wallet debit", async () => {
    const { customer, t, rideId, customerId, riderId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("payments", {
        rideId,
        studentId: customerId,
        riderId,
        amount: 500,
        currency: "NGN",
        paystackReference: "paystack-failed",
        status: "failed",
        method: "paystack",
        createdAt: Date.now(),
      });
    });
    await expect(customer.mutation(api.payments.payRideFromWallet, { rideId })).rejects.toThrow("Paystack payment must be resolved");
    const customerRecord = await t.run((ctx) => ctx.db.get(customerId));
    expect(customerRecord?.walletBalance).toBe(1000);
  });

  it("keeps marketplace rides out of direct Paystack setup while allowing legacy rides", async () => {
    const { t, customer, customerId, rideId } = await setup();
    expect(await t.query(internal.payments.getPaymentContext, { rideId, studentId: customerId })).toBeNull();
    const marketplaceFetch = vi.fn();
    vi.stubGlobal("fetch", marketplaceFetch);
    vi.stubEnv("PAYSTACK_MODE", "test");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_mock_only");
    await expect(customer.action(api.paystack.initializeRidePayment, { rideId })).rejects.toThrow("only pay for your own student ride");
    expect(marketplaceFetch).not.toHaveBeenCalled();

    const legacyRideId = await t.run((ctx) => ctx.db.insert("rides", {
      userId: customerId,
      fare: 650,
      status: "requested",
      paymentStatus: "pending",
      requestedAt: Date.now(),
    }));
    marketplaceFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      status: true,
      data: { authorization_url: "https://checkout.test.invalid/mock-session" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const initialized = await customer.action(api.paystack.initializeRidePayment, { rideId: legacyRideId });
    expect(initialized.authorizationUrl).toBe("https://checkout.test.invalid/mock-session");
    expect(marketplaceFetch).toHaveBeenCalledTimes(1);

    marketplaceFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      status: true,
      data: {
        reference: initialized.payment.paystackReference,
        status: "success",
        amount: 65000,
        currency: "NGN",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const verified = await customer.action(api.paystack.verifyRidePayment, { rideId: legacyRideId });
    expect(verified).toMatchObject({ status: "paid", amount: 650, method: "paystack" });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects unpaid ride progression and does not expose client payment confirmation", async () => {
    const { rider, t, rideId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(rideId, { status: "rider_arriving", paymentStatus: "pending" });
    });
    await expect(rider.mutation(api.rides.updateStatus, { rideId, status: "in_progress" })).rejects.toThrow("payment must be confirmed");
    const internalKeys = Object.keys(api.payments);
    expect(internalKeys).not.toContain("markPaymentPaid");
  });

  it("accepts a Paystack result once and ignores a replay", async () => {
    const { t, customerId, riderId, rideId } = await setup();
    const paymentId = await t.run((ctx) => ctx.db.insert("payments", {
      rideId,
      studentId: customerId,
      riderId,
      amount: 500,
      currency: "NGN",
      paystackReference: "callback-reference",
      status: "pending",
      method: "paystack",
      createdAt: Date.now(),
    }));
    const result = await t.mutation(internal.payments.markPaymentPaid, {
      reference: "callback-reference",
      amount: 50000,
      currency: "NGN",
    });
    const replay = await t.mutation(internal.payments.markPaymentPaid, {
      reference: "callback-reference",
      amount: 50000,
      currency: "NGN",
    });
    expect(result.updated).toBe(true);
    expect(replay.updated).toBe(false);
    const payment = await t.run((ctx) => ctx.db.get(paymentId));
    expect(payment?.status).toBe("paid");
    const notifications = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notifications.filter((item) => item.type === "payment_confirmed")).toHaveLength(2);
  });

  it("rejects forged Paystack callback amounts without confirming payment", async () => {
    const { t, customerId, riderId, rideId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("payments", {
        rideId,
        studentId: customerId,
        riderId,
        amount: 500,
        currency: "NGN",
        paystackReference: "forged-callback",
        status: "pending",
        method: "paystack",
        createdAt: Date.now(),
      });
    });
    const result = await t.mutation(internal.payments.markPaymentPaid, {
      reference: "forged-callback",
      amount: 1,
      currency: "NGN",
    });
    const ride = await t.run((ctx) => ctx.db.get(rideId));
    const notifications = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(result).toMatchObject({ updated: false, reason: "Amount or currency mismatch" });
    expect(ride?.paymentStatus).toBe("failed");
    expect(notifications.filter((item) => item.type === "payment_confirmed")).toHaveLength(0);
  });

  it("applies cancellation refund and fee once and preserves actor-specific messaging", async () => {
    const { customer, t, customerId, riderId, rideId } = await setup();
    await seedHeldPayment(t, { customerId, riderId, rideId });
    await t.run(async (ctx) => {
      await ctx.db.insert("rideOffers", {
        rideId,
        riderId,
        fare: 500,
        currency: "NGN",
        status: "accepted",
        createdAt: Date.now(),
      });
    });
    await customer.mutation(api.rides.cancelRide, { rideId });
    await customer.mutation(api.rides.cancelRide, { rideId });
    const customerRecord = await t.run((ctx) => ctx.db.get(customerId));
    const ride = await t.run((ctx) => ctx.db.get(rideId));
    const transactions = await t.run((ctx) => ctx.db.query("walletTransactions").collect());
    const ledger = await t.run((ctx) => ctx.db.query("financialLedger").collect());
    const notifications = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(customerRecord?.walletBalance).toBe(900);
    expect(ride).toMatchObject({ status: "cancelled", cancellationReason: "student_cancelled" });
    expect(transactions.filter((item) => item.type === "ride_refund")).toHaveLength(1);
    expect(transactions.filter((item) => item.type === "cancellation_fee")).toHaveLength(1);
    expect(ledger.filter((item) => item.kind === "refund")).toHaveLength(1);
    expect(notifications.filter((item) => item.type === "ride_cancelled")).toHaveLength(2);
    expect(notifications.find((item) => item.userId === riderId && item.type === "ride_cancelled")?.body).toContain("customer cancelled");
  });

  it("records a legacy Paystack cancellation refund for manual review without crediting the wallet", async () => {
    const { customer, t, customerId, riderId, rideId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(rideId, { requestStatus: "booked" });
      await ctx.db.insert("payments", {
        rideId,
        studentId: customerId,
        riderId,
        amount: 500,
        currency: "NGN",
        paystackReference: "legacy-paystack-paid",
        status: "paid",
        method: "paystack",
        createdAt: Date.now(),
        paidAt: Date.now(),
      });
    });

    await customer.mutation(api.rides.cancelRide, { rideId });
    await customer.mutation(api.rides.cancelRide, { rideId });

    const customerRecord = await t.run((ctx) => ctx.db.get(customerId));
    const refunds = await t.run((ctx) => ctx.db.query("paymentRefunds").collect());
    const refundLedger = await t.run((ctx) => ctx.db.query("financialLedger")
      .withIndex("by_kind", (q) => q.eq("kind", "refund"))
      .collect());
    expect(customerRecord?.walletBalance).toBe(1000);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      transactionReference: "legacy-paystack-paid",
      amount: 500,
      status: "review",
    });
    expect(refundLedger).toHaveLength(1);
    expect(refundLedger[0]).toMatchObject({ amount: 500, status: "review" });
  });

  it("records a valid late Paystack success on a cancelled legacy ride once and rejects mismatches", async () => {
    const { t, customerId, riderId, rideId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(rideId, { status: "cancelled", paymentStatus: "pending", requestStatus: undefined });
      await ctx.db.insert("payments", {
        rideId,
        studentId: customerId,
        riderId,
        amount: 500,
        currency: "NGN",
        paystackReference: "legacy-late-paystack",
        status: "cancelled",
        method: "paystack",
        createdAt: Date.now(),
      });
    });

    const mismatch = await t.mutation(internal.payments.markPaymentPaid, {
      reference: "legacy-late-paystack",
      amount: 49900,
      currency: "NGN",
    });
    const verified = await t.mutation(internal.payments.markPaymentPaid, {
      reference: "legacy-late-paystack",
      amount: 50000,
      currency: "NGN",
    });
    const replay = await t.mutation(internal.payments.markPaymentPaid, {
      reference: "legacy-late-paystack",
      amount: 50000,
      currency: "NGN",
    });

    const refunds = await t.run((ctx) => ctx.db.query("paymentRefunds").collect());
    const customerRecord = await t.run((ctx) => ctx.db.get(customerId));
    expect(mismatch).toMatchObject({ updated: false, reason: "Amount or currency mismatch" });
    expect(verified).toMatchObject({
      updated: false,
      reason: "Ride was cancelled; refund is recorded for manual review",
    });
    expect(replay.updated).toBe(false);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ status: "review", transactionReference: "legacy-late-paystack" });
    expect(customerRecord?.walletBalance).toBe(1000);
  });

  it("notifies the customer when the assigned rider cancels", async () => {
    const { rider, t, customerId, riderId, rideId } = await setup();
    await seedHeldPayment(t, { customerId, riderId, rideId });
    await t.run(async (ctx) => {
      await ctx.db.insert("rideOffers", {
        rideId,
        riderId,
        fare: 500,
        currency: "NGN",
        status: "accepted",
        createdAt: Date.now(),
      });
    });
    await rider.mutation(api.rides.updateStatus, { rideId, status: "cancelled" });
    const notification = await t.run(async (ctx) =>
      ctx.db.query("notifications")
        .withIndex("by_user_created", (q) => q.eq("userId", customerId))
        .first(),
    );
    expect(notification?.body).toContain("assigned rider cancelled");
  });

  it("cannot complete or settle an already completed ride twice", async () => {
    const { customer, t, customerId, riderId, rideId } = await setup();
    const paymentId = await seedHeldPayment(t, { customerId, riderId, rideId });
    await t.run(async (ctx) => {
      await ctx.db.patch(rideId, { status: "awaiting_confirmation" });
      await ctx.db.patch(paymentId, { paymentStage: "awaiting_completion" });
    });
    await customer.mutation(api.rides.confirmRideCompletion, { rideId });
    await customer.mutation(api.rides.confirmRideCompletion, { rideId });
    const earnings = await t.run((ctx) => ctx.db.query("riderEarnings").collect());
    const ride = await t.run((ctx) => ctx.db.get(rideId));
    expect(earnings).toHaveLength(1);
    expect(ride?.status).toBe("completed");
  });
});

describe("rider payouts", () => {
  it("derives payout amount from one owned eligible earning and makes requests idempotent", async () => {
    const { rider, t, customerId, riderId, rideId } = await setup();
    const { earningsId } = await t.run(async (ctx) => {
      const paymentId = await ctx.db.insert("payments", {
        rideId,
        studentId: customerId,
        riderId,
        amount: 700,
        currency: "NGN",
        paystackReference: "earning-payment",
        status: "paid",
        method: "wallet",
        ledgerStatus: "released",
        paymentStage: "eligible_for_rider",
        createdAt: Date.now(),
      });
      const earningsId = await ctx.db.insert("riderEarnings", {
        riderId,
        rideId,
        paymentId,
        grossFare: 700,
        platformFee: 0,
        riderEarnings: 700,
        currency: "NGN",
        status: "eligible",
        createdAt: Date.now(),
        completedAt: Date.now(),
      });
      return { earningsId };
    });
    const payout = await rider.mutation(api.payments.requestPayout, { earningsId });
    const replay = await rider.mutation(api.payments.requestPayout, { earningsId });
    expect(payout.amount).toBe(700);
    expect(replay.payoutId).toBe(payout.payoutId);
    const payouts = await t.run((ctx) => ctx.db.query("payouts").collect());
    expect(payouts).toHaveLength(1);
    await expect(rider.mutation(api.payments.requestPayout, { earningsId: "unowned" as never })).rejects.toThrow();
  });

  it("records a successful transfer once when a success callback is replayed", async () => {
    const { rider, t, customerId, riderId, rideId } = await setup();
    const { payoutId, earningsId, paymentId } = await t.run(async (ctx) => {
      await ctx.db.patch(rideId, { status: "completed" });
      const paymentId = await ctx.db.insert("payments", {
        rideId,
        studentId: customerId,
        riderId,
        amount: 500,
        currency: "NGN",
        paystackReference: "payout-payment",
        status: "paid",
        paymentStage: "eligible_for_rider",
        ledgerStatus: "released",
        createdAt: Date.now(),
      });
      const earningsId = await ctx.db.insert("riderEarnings", {
        riderId,
        rideId,
        paymentId,
        grossFare: 500,
        platformFee: 0,
        riderEarnings: 500,
        currency: "NGN",
        status: "pending",
        createdAt: Date.now(),
        completedAt: Date.now(),
      });
      const payoutId = await ctx.db.insert("payouts", {
        riderId,
        rideId,
        paymentId,
        earningsId,
        amount: 500,
        currency: "NGN",
        status: "processing",
        reference: "payout-reference",
        createdAt: Date.now(),
      });
      return { payoutId, earningsId, paymentId };
    });
    await t.mutation(internal.payments.markPayoutProviderResult, { reference: "payout-reference", status: "success" });
    await t.mutation(internal.payments.markPayoutProviderResult, { reference: "payout-reference", status: "success" });
    const payout = await t.run((ctx) => ctx.db.get(payoutId));
    const earning = await t.run((ctx) => ctx.db.get(earningsId));
    const paidLedger = await t.run((ctx) =>
      ctx.db.query("financialLedger").withIndex("by_reference", (q) => q.eq("reference", "payout-reference")).collect(),
    );
    expect(payout?.status).toBe("paid");
    expect(earning?.status).toBe("paid");
    expect(paidLedger.filter((entry) => entry.status === "paid")).toHaveLength(1);
    expect(paymentId).toBeTruthy();
  });
});
