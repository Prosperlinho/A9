import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ensurePaystackRideRefund } from "./refundHelpers";

const paymentStatus = v.union(
  v.literal("pending"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("processing"),
);
const paymentStage = v.union(
  v.literal("unpaid"), v.literal("paid_held"), v.literal("awaiting_completion"),
  v.literal("eligible_for_rider"), v.literal("pending_payout"), v.literal("paid_to_rider"),
  v.literal("refunded"), v.literal("disputed"),
);
const payoutStatus = v.union(v.literal("pending"), v.literal("processing"), v.literal("paid"), v.literal("failed"), v.literal("retry"), v.literal("review"));
const paymentReturn = v.object({
  _id: v.id("payments"),
  _creationTime: v.number(),
  rideId: v.id("rides"),
  studentId: v.id("users"),
  riderId: v.optional(v.id("users")),
  amount: v.number(),
  currency: v.literal("NGN"),
  paystackReference: v.string(),
  status: paymentStatus,
  method: v.optional(v.union(v.literal("paystack"), v.literal("wallet"))),
  ledgerStatus: v.optional(v.union(v.literal("held"), v.literal("released"), v.literal("refunded"))),
  paymentStage: v.optional(paymentStage),
  studentWalletTransactionReference: v.optional(v.string()),
  completionAt: v.optional(v.number()),
  releaseAt: v.optional(v.number()),
  payoutStatus: v.optional(payoutStatus),
  createdAt: v.number(),
  paidAt: v.optional(v.number()),
  verificationAt: v.optional(v.number()),
  failureReason: v.optional(v.string()),
  authorizationUrl: v.optional(v.string()),
});

async function currentUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in required");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Account profile not found");
  return user;
}

export const getRidePayment = query({
  args: { rideId: v.id("rides") },
  returns: v.union(v.null(), paymentReturn),
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== user._id) throw new Error("Ride access denied");
    const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", args.rideId)).first();
    return payment ? payment : null;
  },
});

export const payRideFromWallet = mutation({
  args: { rideId: v.id("rides") },
  returns: paymentReturn,
  handler: async (ctx, args) => {
    const student = await currentUser(ctx);
    if (student.role !== "student") throw new Error("Only students can pay for rides");
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== student._id) throw new Error("You can only pay for your own ride");
    if (ride.fare === undefined) throw new Error("Agree on a ride price before making payment");
    if (ride.status === "cancelled" || ride.status === "completed") {
      throw new Error("This ride is no longer eligible for payment");
    }
    const awaitingPayment = ride.status === "requested" ||
      (ride.status === "accepted" && ride.requestStatus === "booked");
    if (!awaitingPayment || (ride.requestStatus && ride.requestStatus !== "booked")) {
      throw new Error("This ride is not ready for payment");
    }
    const existing = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", args.rideId)).first();
    if (existing?.status === "paid") return existing;
    if (existing && existing.status !== "failed") throw new Error("A payment is already processing for this ride");
    if (existing && existing.method !== "wallet") {
      throw new Error("An earlier Paystack payment must be resolved before using your wallet");
    }
    const availableBalance = student.walletBalance - (student.walletReserved ?? 0);
    if (availableBalance < ride.fare) throw new Error("Insufficient wallet balance");
    const now = Date.now();
    const reference = `A9-WALLET-RIDE-${String(ride._id)}-${now}`;
    const paymentId = existing
      ? existing._id
      : await ctx.db.insert("payments", {
          rideId: ride._id,
          studentId: student._id,
          riderId: ride.riderId,
          amount: ride.fare,
          currency: "NGN",
          paystackReference: reference,
          status: "paid",
          method: "wallet",
          ledgerStatus: "held",
          paymentStage: "paid_held",
          studentWalletTransactionReference: reference,
          payoutStatus: "pending",
          createdAt: now,
          paidAt: now,
          verificationAt: now,
        });
    if (existing) {
      await ctx.db.patch(existing._id, {
        riderId: ride.riderId,
        amount: ride.fare,
        paystackReference: reference,
        status: "paid",
        method: "wallet",
        ledgerStatus: "held",
        paymentStage: "paid_held",
        studentWalletTransactionReference: reference,
        payoutStatus: "pending",
        paidAt: now,
        verificationAt: now,
        failureReason: undefined,
      });
    }
    await ctx.db.patch(student._id, { walletBalance: student.walletBalance - ride.fare });
    await ctx.db.insert("walletTransactions", {
      userId: student._id,
      amount: -ride.fare,
      type: "ride_charge",
      description: "Ride payment held by A9",
      rideId: ride._id,
      createdAt: now,
      provider: "a9_wallet",
      providerReference: reference,
    });
    await ctx.db.insert("financialLedger", {
      kind: "ride_payment", direction: "debit", userId: student._id, rideId: ride._id,
      paymentId, amount: ride.fare, currency: "NGN", reference, status: "paid_held", createdAt: now,
    });
    await ctx.db.insert("financialLedger", {
      kind: "payment_pool_hold", direction: "credit", userId: student._id, rideId: ride._id,
      paymentId, amount: ride.fare, currency: "NGN", reference: `${reference}-POOL`, status: "held", createdAt: now,
    });
    await ctx.db.patch(ride._id, { paymentStatus: "paid" });
    await ctx.db.insert("notifications", {
      userId: student._id,
      type: "payment_confirmed",
      title: "Ride payment confirmed",
      body: `Your payment of ₦${ride.fare.toLocaleString("en-NG")} has been confirmed.`,
      rideId: ride._id,
      destination: "dashboard",
      createdAt: now,
    });
    if (ride.riderId) {
      await ctx.db.insert("notifications", {
        userId: ride.riderId,
        type: "payment_confirmed",
        title: "Customer payment confirmed",
        body: "The customer’s ride payment has been confirmed. You may proceed with the ride.",
        rideId: ride._id,
        destination: "dashboard",
        createdAt: now,
      });
    }
    return (await ctx.db.get(paymentId))!;
  },
});

export const listMyRidePayments = query({
  args: {},
  returns: v.array(paymentReturn),
  handler: async (ctx) => {
    const student = await currentUser(ctx);
    if (student.role !== "student") throw new Error("Student access required");
    const rides = await ctx.db.query("rides").withIndex("by_user", (q: any) => q.eq("userId", student._id)).order("desc").take(50);
    const payments = await Promise.all(rides.map((ride: any) => ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", ride._id)).first()));
    return payments.filter(Boolean) as any;
  },
});

export const getAdminFinancialRecords = query({
  args: {},
  returns: v.array(v.object({
    kind: v.union(v.literal("wallet_funding"), v.literal("ride_payment"), v.literal("withdrawal"), v.literal("rider_earning"), v.literal("refund"), v.literal("cancellation_fee")),
    userName: v.optional(v.string()), amount: v.number(), currency: v.literal("NGN"), reference: v.string(),
    createdAt: v.number(), status: v.string(),
  })),
  handler: async (ctx) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const [fundings, payments, withdrawals, earnings, refunds, cancellationFees] = await Promise.all([
      ctx.db.query("walletFundingRequests").withIndex("by_created_at").order("desc").take(50),
      ctx.db.query("payments").withIndex("by_created_at").order("desc").take(50),
      ctx.db.query("withdrawals").withIndex("by_created_at").order("desc").take(50),
      ctx.db.query("riderEarnings").withIndex("by_rider").take(100),
      ctx.db.query("financialLedger").withIndex("by_kind", (q: any) => q.eq("kind", "refund")).order("desc").take(50),
      ctx.db.query("financialLedger").withIndex("by_kind", (q: any) => q.eq("kind", "cancellation_fee")).order("desc").take(50),
    ]);
    const userName = async (userId: any) => {
      const record: any = await ctx.db.get(userId);
      return record?.name as string | undefined;
    };
    return [
      ...(await Promise.all(fundings.map(async (item: any) => ({ kind: "wallet_funding" as const, userName: await userName(item.userId), amount: item.amount, currency: "NGN" as const, reference: item.providerReference ?? String(item._id), createdAt: item.createdAt, status: item.status })))),
      ...(await Promise.all(payments.map(async (item: any) => ({ kind: "ride_payment" as const, userName: await userName(item.studentId), amount: item.amount, currency: "NGN" as const, reference: item.paystackReference, createdAt: item.createdAt, status: item.ledgerStatus === "released" ? "settled" : item.ledgerStatus ?? item.status })))),
      ...(await Promise.all(withdrawals.map(async (item: any) => ({ kind: "withdrawal" as const, userName: await userName(item.userId), amount: item.amount, currency: "NGN" as const, reference: item.reference, createdAt: item.createdAt, status: item.status })))),
      ...(await Promise.all(earnings.map(async (item: any) => ({ kind: "rider_earning" as const, userName: await userName(item.riderId), amount: item.riderEarnings, currency: "NGN" as const, reference: `ride-${String(item.rideId).slice(-8)}`, createdAt: item.completedAt, status: item.status })))),
      ...(await Promise.all(refunds.map(async (item: any) => ({ kind: "refund" as const, userName: await userName(item.userId), amount: item.amount, currency: "NGN" as const, reference: item.reference, createdAt: item.createdAt, status: item.status })))),
      ...(await Promise.all(cancellationFees.map(async (item: any) => ({ kind: "cancellation_fee" as const, userName: await userName(item.userId), amount: item.amount, currency: "NGN" as const, reference: item.reference, createdAt: item.createdAt, status: item.status })))),
    ].sort((a, b) => b.createdAt - a.createdAt).slice(0, 150);
  },
});

export const getPaymentPoolSummary = query({
  args: {},
  returns: v.object({
    total: v.number(), held: v.number(), eligible: v.number(), pendingPayout: v.number(), paid: v.number(), refunded: v.number(), disputed: v.number(),
    records: v.array(v.object({
      paymentId: v.id("payments"), rideId: v.id("rides"), studentName: v.optional(v.string()), riderName: v.optional(v.string()), amount: v.number(),
      paymentStage: v.string(), rideStatus: v.string(), createdAt: v.number(), completedAt: v.optional(v.number()), payoutId: v.optional(v.id("payouts")), payoutStatus: v.string(),
      refundedAmount: v.number(),
    })),
  }),
  handler: async (ctx) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const payments = await ctx.db.query("payments").withIndex("by_created_at").order("desc").take(200);
    const records = await Promise.all(payments.map(async (payment: any) => {
      const ride: any = await ctx.db.get(payment.rideId);
      const student: any = await ctx.db.get(payment.studentId);
      const rider: any = payment.riderId || ride?.riderId ? await ctx.db.get(payment.riderId ?? ride.riderId) : null;
      const payout: any = await ctx.db.query("payouts").withIndex("by_ride", (q: any) => q.eq("rideId", payment.rideId)).first();
      return {
        paymentId: payment._id, rideId: payment.rideId, studentName: student?.name, riderName: rider?.name, amount: payment.amount,
        paymentStage: payment.paymentStage ?? (payment.status === "paid" ? "paid_held" : "unpaid"), rideStatus: ride?.status ?? "unknown",
        createdAt: payment.createdAt, completedAt: payment.completionAt ?? ride?.completedAt, payoutId: payout?._id, payoutStatus: payout?.status ?? payment.payoutStatus ?? "unassigned",
        refundedAmount: payment.refundedAmount ?? 0,
      };
    }));
    const stage = (name: string) => records.filter((item) => item.paymentStage === name).reduce((sum, item) => sum + item.amount, 0);
    return {
      held: records.filter((item) => item.paymentStage === "paid_held" || item.paymentStage === "awaiting_completion").reduce((sum, item) => sum + item.amount, 0),
      eligible: stage("eligible_for_rider"),
      pendingPayout: records.filter((item) => item.payoutStatus === "pending" || item.payoutStatus === "processing" || item.payoutStatus === "retry").reduce((sum, item) => sum + item.amount, 0),
      paid: stage("paid_to_rider"), refunded: records.reduce((sum, item) => sum + item.refundedAmount, 0), disputed: stage("disputed"),
      total: records.filter((item) => ["paid_held", "awaiting_completion", "eligible_for_rider", "disputed"].includes(item.paymentStage) || ["pending", "processing", "retry"].includes(item.payoutStatus)).reduce((sum, item) => sum + item.amount, 0),
      records,
    };
  },
});

export const requestPayout = mutation({
  args: { earningsId: v.id("riderEarnings") },
  returns: v.object({
    payoutId: v.id("payouts"),
    amount: v.number(),
    bankName: v.string(),
    accountNumber: v.string(),
    accountName: v.string(),
  }),
  handler: async (ctx, args) => {
    const rider = await currentUser(ctx);
    if (rider.role !== "rider") throw new Error("Rider access required");
    const source: any = await ctx.db.get(args.earningsId);
    if (!source || source.riderId !== rider._id) throw new Error("Ride earnings not found");
    const amount = source.riderEarnings;
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Eligible ride earnings are invalid");
    const bankName = (rider.payoutBankName ?? "").trim();
    const accountNumber = (rider.payoutAccountNumber ?? "").trim();
    const accountName = (rider.payoutAccountName ?? "").trim();
    const bankCode = (rider.payoutBankCode ?? "").trim();
    if (!bankName || !bankCode || !accountNumber || !accountName) throw new Error("Add your payout bank code and account details before requesting a payout.");
    const existing = await ctx.db.query("payouts").withIndex("by_ride", (q: any) => q.eq("rideId", source.rideId)).first();
    if (existing) {
      if (existing.riderId !== rider._id || existing.earningsId !== source._id || existing.amount !== amount) {
        throw new Error("A payout already exists for this ride");
      }
      return { payoutId: existing._id, amount: existing.amount, bankName: existing.bankName ?? bankName, accountNumber: existing.accountNumber ?? accountNumber, accountName: existing.accountName ?? accountName };
    }
    if (source.status !== "eligible") throw new Error("These ride earnings are not available for payout");
    const now = Date.now();
    const reference = `A9-PAYOUT-${String(rider._id)}-${now}`;
    const payoutId = await ctx.db.insert("payouts", {
      riderId: rider._id,
      rideId: source.rideId,
      paymentId: source.paymentId,
      earningsId: source._id,
      amount,
      currency: "NGN",
      status: "pending",
      reference,
      createdAt: now,
      requestedAt: now,
      requestedBy: rider._id,
      bankName,
      provider: "paystack_transfer",
      providerReference: reference,
      accountNumber,
      accountName,
    });
    await ctx.db.patch(source._id, { status: "pending" });
    const payment = await ctx.db.get(source.paymentId);
    if (payment) await ctx.db.patch(payment._id, { payoutStatus: "pending", paymentStage: "pending_payout" });
    await ctx.db.insert("financialLedger", {
      kind: "rider_payout",
      direction: "debit",
      riderId: rider._id,
      rideId: source.rideId,
      paymentId: source.paymentId,
      payoutId,
      amount,
      currency: "NGN",
      reference,
      status: "pending",
      createdAt: now,
    });
    return { payoutId, amount, bankName, accountNumber, accountName };
  },
});

export const getPayoutProcessingContext = internalQuery({
  args: { payoutId: v.id("payouts") },
  returns: v.union(v.null(), v.object({
    payoutId: v.id("payouts"), riderId: v.id("users"), rideId: v.id("rides"), paymentId: v.id("payments"),
    amount: v.number(), status: payoutStatus, reference: v.string(), bankName: v.string(), bankCode: v.string(),
    accountNumber: v.string(), accountName: v.string(), rideStatus: v.string(), paymentStatus: paymentStatus,
    paymentStage: v.optional(paymentStage), verificationStatus: v.optional(v.string()), disputeReason: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) return null;
    const rider = await ctx.db.get(payout.riderId);
    const ride = await ctx.db.get(payout.rideId);
    const payment = await ctx.db.get(payout.paymentId);
    if (!rider || !ride || !payment || !payout.bankName || !payout.accountNumber || !payout.accountName || !rider.payoutBankCode) return null;
    return { payoutId: payout._id, riderId: rider._id, rideId: ride._id, paymentId: payment._id, amount: payout.amount, status: payout.status, reference: payout.reference, bankName: payout.bankName, bankCode: rider.payoutBankCode, accountNumber: payout.accountNumber, accountName: payout.accountName, rideStatus: ride.status, paymentStatus: payment.status, paymentStage: payment.paymentStage, verificationStatus: rider.verificationStatus, disputeReason: ride.disputeReason };
  },
});

export const markPayoutProcessing = internalMutation({
  args: { payoutId: v.id("payouts") }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout || payout.status === "paid" || payout.status === "processing") return false;
    if (payout.status !== "pending" && payout.status !== "retry") return false;
    const now = Date.now();
    await ctx.db.patch(payout._id, { status: "processing", lastAttemptAt: now, retryCount: (payout.retryCount ?? 0) + 1 });
    const payment = await ctx.db.get(payout.paymentId);
    if (payment) await ctx.db.patch(payment._id, { payoutStatus: "processing", paymentStage: "pending_payout" });
    await ctx.db.insert("auditEvents", { category: "financial", action: "payout_initiated", status: "processing", riderId: payout.riderId, rideId: payout.rideId, paymentId: payout.paymentId, payoutId: payout._id, createdAt: now });
    return true;
  },
});

export const markPayoutReview = internalMutation({
  args: { payoutId: v.id("payouts"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout || payout.status === "paid") return null;
    await ctx.db.patch(payout._id, { status: "review", reviewReason: args.reason, failureReason: args.reason });
    const payment = await ctx.db.get(payout.paymentId);
    if (payment) await ctx.db.patch(payment._id, { payoutStatus: "review", paymentStage: "disputed" });
    await ctx.db.insert("auditEvents", { category: "financial", action: "payout_blocked", status: "review", riderId: payout.riderId, rideId: payout.rideId, paymentId: payout.paymentId, payoutId: payout._id, reason: args.reason, createdAt: Date.now() });
    return null;
  },
});

export const markPayoutFailed = internalMutation({
  args: { payoutId: v.id("payouts"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout || payout.status === "paid") return null;
    await ctx.db.patch(payout._id, { status: "retry", failureReason: args.reason, reviewReason: undefined });
    const payment = await ctx.db.get(payout.paymentId);
    if (payment) await ctx.db.patch(payment._id, { payoutStatus: "retry", paymentStage: "eligible_for_rider" });
    await ctx.db.insert("auditEvents", { category: "financial", action: "payout_failed", status: "retry", riderId: payout.riderId, rideId: payout.rideId, paymentId: payout.paymentId, payoutId: payout._id, reason: args.reason, createdAt: Date.now() });
    return null;
  },
});

export const markPayoutProviderResult = internalMutation({
  args: { reference: v.string(), status: v.union(v.literal("success"), v.literal("failed")), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payout = await ctx.db.query("payouts").withIndex("by_reference", (q: any) => q.eq("reference", args.reference)).first();
    if (!payout || payout.status === "paid") return null;
    if (args.status === "failed") {
      await ctx.db.patch(payout._id, { status: "retry", failureReason: args.reason ?? "Paystack transfer failed" });
      const payment = await ctx.db.get(payout.paymentId);
      if (payment) await ctx.db.patch(payment._id, { payoutStatus: "retry", paymentStage: "eligible_for_rider" });
      await ctx.db.insert("auditEvents", { category: "financial", action: "payout_failed", status: "retry", riderId: payout.riderId, rideId: payout.rideId, paymentId: payout.paymentId, payoutId: payout._id, reason: args.reason, createdAt: Date.now() });
      return null;
    }
    const earnings = await ctx.db.get(payout.earningsId);
    if (earnings) await ctx.db.patch(earnings._id, { status: "paid" });
    await ctx.db.patch(payout._id, { status: "paid", processedAt: Date.now(), failureReason: undefined, reviewReason: undefined });
    const payment = await ctx.db.get(payout.paymentId);
    if (payment) await ctx.db.patch(payment._id, { payoutStatus: "paid", paymentStage: "paid_to_rider", ledgerStatus: "released" });
    await ctx.db.insert("financialLedger", { kind: "rider_payout", direction: "debit", riderId: payout.riderId, rideId: payout.rideId, paymentId: payout.paymentId, payoutId: payout._id, amount: payout.amount, currency: "NGN", reference: payout.reference, status: "paid", createdAt: Date.now() });
    await ctx.db.insert("auditEvents", { category: "financial", action: "payout_succeeded", status: "paid", riderId: payout.riderId, rideId: payout.rideId, paymentId: payout.paymentId, payoutId: payout._id, createdAt: Date.now() });
    return null;
  },
});

export const getRiderPayouts = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("payouts"),
    riderId: v.id("users"),
    rideId: v.id("rides"),
    amount: v.number(),
    currency: v.literal("NGN"),
    status: payoutStatus,
    reference: v.string(),
    createdAt: v.number(),
    requestedAt: v.optional(v.number()),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    accountName: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const rider = await currentUser(ctx);
    if (rider.role !== "rider") throw new Error("Rider access required");
    const payouts = await ctx.db.query("payouts").withIndex("by_rider", (q: any) => q.eq("riderId", rider._id)).order("desc").take(50);
    return payouts.map((item: any) => ({
      _id: item._id,
      riderId: item.riderId,
      rideId: item.rideId,
      amount: item.amount,
      currency: item.currency,
      status: item.status,
      reference: item.reference,
      createdAt: item.createdAt,
      requestedAt: item.requestedAt,
      bankName: item.bankName,
      accountNumber: item.accountNumber,
      accountName: item.accountName,
    }));
  },
});

export const getPayoutRequests = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("payouts"),
    riderId: v.id("users"),
    riderName: v.optional(v.string()),
    amount: v.number(),
    currency: v.literal("NGN"),
    status: payoutStatus,
    reference: v.string(),
    createdAt: v.number(),
    requestedAt: v.optional(v.number()),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    accountName: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const payouts = await ctx.db.query("payouts").order("desc").take(100);
    const enriched = await Promise.all(payouts.map(async (item: any) => {
      const rider = (await ctx.db.get(item.riderId)) as any;
      return {
        _id: item._id,
        riderId: item.riderId,
        riderName: rider?.name,
        amount: item.amount,
        currency: item.currency,
        status: item.status,
        reference: item.reference,
        createdAt: item.createdAt,
        requestedAt: item.requestedAt,
        bankName: item.bankName,
        accountNumber: item.accountNumber,
        accountName: item.accountName,
      };
    }));
    return enriched;
  },
});

export const approvePayoutRequest = mutation({
  args: { payoutId: v.id("payouts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) throw new Error("Payout request not found");
    if (payout.status === "paid" || payout.status === "processing") return null;
    const ride = await ctx.db.get(payout.rideId);
    if (!ride || ride.status !== "completed" || ride.disputeReason) throw new Error("This payout is blocked by ride completion or dispute state");
    const rider = await ctx.db.get(payout.riderId);
    if (!rider || rider.verificationStatus !== "approved" || !rider.payoutBankCode) throw new Error("Rider verification or payout destination is incomplete");
    const now = Date.now();
    await ctx.db.patch(args.payoutId, {
      status: "pending",
      approvedAt: now,
      approvedBy: admin._id,
      reviewReason: undefined,
      failureReason: undefined,
    });
    const payment = await ctx.db.get(payout.paymentId);
    if (payment) await ctx.db.patch(payment._id, { payoutStatus: "pending", paymentStage: "eligible_for_rider" });
    await ctx.db.insert("auditEvents", { category: "financial", action: "payout_manually_reviewed", status: "approved", actorId: admin._id, riderId: payout.riderId, rideId: payout.rideId, paymentId: payout.paymentId, payoutId: payout._id, createdAt: now });
    await ctx.scheduler.runAfter(0, internal.paystack.processEligiblePayout, { payoutId: payout._id });
    return null;
  },
});

export const rejectPayoutRequest = mutation({
  args: { payoutId: v.id("payouts"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const payout = await ctx.db.get(args.payoutId);
    if (!payout || payout.status === "paid") return null;
    const now = Date.now();
    const earnings = await ctx.db.get(payout.earningsId);
    if (earnings) await ctx.db.patch(earnings._id, { status: "eligible" });
    await ctx.db.patch(args.payoutId, {
      status: "failed",
      rejectedAt: now,
      rejectedBy: admin._id,
      rejectionReason: args.reason.trim() || "Payout rejected by administrator",
    });
    const payment = await ctx.db.get(payout.paymentId);
    if (payment) await ctx.db.patch(payment._id, { payoutStatus: "failed", paymentStage: "eligible_for_rider" });
    return null;
  },
});

export const markPayoutPaid = mutation({
  args: { payoutId: v.id("payouts"), method: v.optional(v.string()), notes: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const payout = await ctx.db.get(args.payoutId);
    if (!payout || payout.status === "paid") return null;
    throw new Error("Payouts are marked paid only by a verified Paystack transfer webhook");
  },
});

export const getPaymentContext = internalQuery({
  args: { rideId: v.id("rides"), studentId: v.id("users") },
  returns: v.union(v.null(), v.object({
    rideId: v.id("rides"), studentId: v.id("users"), amount: v.number(), email: v.string(),
    existingPayment: v.union(v.null(), paymentReturn),
  })),
  handler: async (ctx, args) => {
    const student = await ctx.db.get(args.studentId);
    const ride = await ctx.db.get(args.rideId);
    if (!student || student.role !== "student" || !ride || ride.userId !== args.studentId) return null;
    if (ride.status === "cancelled" || ride.status === "completed") return null;
    if (ride.fare === undefined) return null;
    if (ride.requestStatus) return null;
    const payment = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", args.rideId)).first();
    return {
      rideId: ride._id,
      studentId: student._id,
      amount: ride.fare,
      email: student.email ?? "",
      existingPayment: payment ?? null,
    };
  },
});

export const createPendingPayment = internalMutation({
  args: { rideId: v.id("rides"), studentId: v.id("users"), amount: v.number(), reference: v.string() },
  returns: paymentReturn,
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride || ride.userId !== args.studentId) throw new Error("Ride access denied");
    if (ride.status === "cancelled" || ride.status === "completed") {
      throw new Error("This ride is no longer eligible for payment");
    }
    if (ride.requestStatus) {
      throw new Error("Marketplace rides must use the supported wallet payment flow");
    }
    const existing = await ctx.db.query("payments").withIndex("by_ride", (q: any) => q.eq("rideId", args.rideId)).first();
    if (existing) return existing;
    const paymentId = await ctx.db.insert("payments", {
      rideId: args.rideId,
      studentId: args.studentId,
      riderId: ride.riderId,
      amount: args.amount,
      currency: "NGN",
      paystackReference: args.reference,
      status: "pending",
      method: "paystack",
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.rideId, { paymentStatus: "pending" });
    return (await ctx.db.get(paymentId))!;
  },
});

export const attachAuthorizationUrl = internalMutation({
  args: { paymentId: v.id("payments"), authorizationUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status === "paid") return null;
    await ctx.db.patch(args.paymentId, { authorizationUrl: args.authorizationUrl });
    return null;
  },
});

export const markPaymentFailed = internalMutation({
  args: { paymentId: v.id("payments"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status === "paid" || payment.status === "cancelled") return null;
    const ride = await ctx.db.get(payment.rideId);
    if (!ride || ride.status === "cancelled" || ride.status === "completed") return null;
    await ctx.db.patch(args.paymentId, { status: "failed", failureReason: args.reason });
    await ctx.db.patch(payment.rideId, { paymentStatus: "failed" });
    return null;
  },
});

export const markPaymentProcessing = internalMutation({
  args: { paymentId: v.id("payments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status === "paid" || payment.status === "cancelled") return null;
    const ride = await ctx.db.get(payment.rideId);
    if (!ride || ride.status === "cancelled" || ride.status === "completed") return null;
    await ctx.db.patch(args.paymentId, { status: "processing" });
    return null;
  },
});

export const markPaymentPaid = internalMutation({
  args: { reference: v.string(), amount: v.number(), currency: v.string(), failureReason: v.optional(v.string()) },
  returns: v.object({ updated: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const payment = await ctx.db.query("payments").withIndex("by_reference", (q: any) => q.eq("paystackReference", args.reference)).unique();
    if (!payment) return { updated: false, reason: "Payment record not found" };
    if (payment.status === "paid") return { updated: false };
    const ride = await ctx.db.get(payment.rideId);
    if (!ride) return { updated: false, reason: "Ride not found" };
    if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0 || !Number.isSafeInteger(payment.amount * 100)) {
      return { updated: false, reason: "Payment amount is invalid" };
    }
    if (args.currency !== "NGN" || args.amount !== payment.amount * 100) {
      if (payment.status === "cancelled" || ride.status === "cancelled" || ride.status === "completed") {
        return { updated: false, reason: "Amount or currency mismatch" };
      }
      await ctx.db.patch(payment._id, { status: "failed", failureReason: "Paystack amount or currency mismatch", verificationAt: Date.now() });
      await ctx.db.patch(payment.rideId, { paymentStatus: "failed" });
      return { updated: false, reason: "Amount or currency mismatch" };
    }
    if (payment.status === "cancelled" || ride.status === "cancelled") {
      if (payment.method !== "paystack" && payment.method !== undefined) {
        return { updated: false, reason: "Cancelled payment is not a Paystack charge" };
      }
      if (ride.requestStatus !== undefined) {
        return { updated: false, reason: "Marketplace payment is not eligible for Paystack refund processing" };
      }
      await ensurePaystackRideRefund(ctx, payment, ride, Date.now());
      return { updated: false, reason: "Ride was cancelled; refund is recorded for manual review" };
    }
    if (ride.status === "completed") {
      return { updated: false, reason: "Ride is no longer eligible for payment" };
    }
    if (ride.requestStatus && (
      ride.requestStatus !== "booked" ||
      !ride.riderId ||
      payment.amount !== ride.fare
    )) {
      return { updated: false, reason: "Payment does not match the selected ride offer" };
    }
    await ctx.db.patch(payment._id, { status: "paid", paidAt: Date.now(), verificationAt: Date.now(), failureReason: undefined });
    await ctx.db.patch(payment.rideId, { paymentStatus: "paid" });
    await ctx.db.insert("notifications", {
      userId: ride.userId,
      type: "payment_confirmed",
      title: "Ride payment confirmed",
      body: `Your payment of ₦${payment.amount.toLocaleString("en-NG")} has been confirmed.`,
      rideId: ride._id,
      destination: "dashboard",
      createdAt: Date.now(),
    });
    if (ride.riderId) {
      await ctx.db.insert("notifications", {
        userId: ride.riderId,
        type: "payment_confirmed",
        title: "Customer payment confirmed",
        body: "The customer’s ride payment has been confirmed. You may proceed with the ride.",
        rideId: ride._id,
        destination: "dashboard",
        createdAt: Date.now(),
      });
    }
    return { updated: true };
  },
});

export const markWebhookFailure = internalMutation({
  args: { reference: v.string(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.query("payments").withIndex("by_reference", (q: any) => q.eq("paystackReference", args.reference)).unique();
    if (!payment || payment.status === "paid" || payment.status === "cancelled") return null;
    const ride = await ctx.db.get(payment.rideId);
    if (!ride || ride.status === "cancelled" || ride.status === "completed") return null;
    await ctx.db.patch(payment._id, { status: "failed", failureReason: args.reason, verificationAt: Date.now() });
    await ctx.db.patch(payment.rideId, { paymentStatus: "failed" });
    return null;
  },
});

export const getFundingContext = internalQuery({
  args: { fundingId: v.id("walletFundingRequests"), userId: v.id("users") },
  returns: v.union(v.null(), v.object({
    fundingId: v.id("walletFundingRequests"), userId: v.id("users"), amount: v.number(), email: v.string(),
    status: v.union(v.literal("pending"), v.literal("verified"), v.literal("failed")),
    providerReference: v.optional(v.string()), authorizationUrl: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const funding = await ctx.db.get(args.fundingId);
    if (!user || !funding || funding.userId !== args.userId) return null;
    return {
      fundingId: funding._id, userId: user._id, amount: funding.amount, email: user.email ?? "",
      status: funding.status, providerReference: funding.providerReference, authorizationUrl: funding.authorizationUrl,
    };
  },
});

export const getFundingVerificationContext = internalQuery({
  args: { reference: v.string() },
  returns: v.union(v.null(), v.object({
    userId: v.id("users"), amount: v.number(), currency: v.optional(v.literal("NGN")),
    status: v.union(v.literal("pending"), v.literal("verified"), v.literal("failed")),
  })),
  handler: async (ctx, args) => {
    const funding = await ctx.db.query("walletFundingRequests")
      .withIndex("by_provider_reference", (q: any) => q.eq("providerReference", args.reference))
      .unique();
    if (!funding || funding.provider !== "paystack") return null;
    return { userId: funding.userId, amount: funding.amount, currency: funding.currency, status: funding.status };
  },
});

export const createFundingRequest = internalMutation({
  args: { userId: v.id("users"), amount: v.number(), reference: v.string() },
  returns: v.id("walletFundingRequests"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("walletFundingRequests", {
      userId: args.userId, amount: args.amount, currency: "NGN", status: "pending", provider: "paystack",
      createdAt: Date.now(), providerReference: args.reference,
    });
  },
});

export const attachFundingAuthorizationUrl = internalMutation({
  args: { fundingId: v.id("walletFundingRequests"), authorizationUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const funding = await ctx.db.get(args.fundingId);
    if (funding && funding.status === "pending") await ctx.db.patch(args.fundingId, { authorizationUrl: args.authorizationUrl });
    return null;
  },
});

export const markFundingVerified = internalMutation({
  args: { reference: v.string(), amount: v.number(), currency: v.string() },
  returns: v.object({ updated: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const record = await ctx.db.query("walletFundingRequests").withIndex("by_provider_reference", (q: any) => q.eq("providerReference", args.reference)).unique();
    if (!record) return { updated: false, reason: "Funding request not found" };
    if (record.status === "verified") return { updated: false };
    const existingTransaction = await ctx.db.query("walletTransactions")
      .withIndex("by_provider_reference", (q: any) => q.eq("providerReference", args.reference))
      .first();
    if (existingTransaction) {
      await ctx.db.patch(record._id, { status: "verified", paidAt: record.paidAt ?? Date.now(), verificationAt: Date.now() });
      return { updated: false };
    }
    if ((record.currency ?? "NGN") !== "NGN" || args.currency !== (record.currency ?? "NGN") || args.amount !== record.amount * 100) {
      await ctx.db.patch(record._id, { status: "failed", failureReason: "Paystack amount or currency mismatch", verificationAt: Date.now() });
      return { updated: false, reason: "Amount or currency mismatch" };
    }
    const user = await ctx.db.get(record.userId);
    if (!user) return { updated: false, reason: "Funding owner not found" };
    const verifiedAt = Date.now();
    await ctx.db.patch(record._id, { status: "verified", paidAt: verifiedAt, verificationAt: verifiedAt });
    await ctx.db.patch(user._id, { walletBalance: user.walletBalance + record.amount });
    await ctx.db.insert("walletTransactions", {
      userId: user._id,
      amount: record.amount,
      type: "top_up",
      description: "Paystack wallet funding",
      currency: "NGN",
      status: "completed",
      createdAt: verifiedAt,
      provider: "paystack",
      providerReference: record.providerReference,
    });
    const ledgerEntry = await ctx.db.query("financialLedger")
      .withIndex("by_reference", (q: any) => q.eq("reference", record.providerReference!))
      .first();
    if (!ledgerEntry) {
      await ctx.db.insert("financialLedger", {
        kind: "wallet_funding", direction: "credit", userId: user._id, amount: record.amount,
        currency: "NGN", reference: record.providerReference!, status: "verified", createdAt: verifiedAt,
      });
    }
    return { updated: true };
  },
});

export const markFundingFailed = internalMutation({
  args: { reference: v.string(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.query("walletFundingRequests").withIndex("by_provider_reference", (q: any) => q.eq("providerReference", args.reference)).unique();
    if (record && record.status === "pending") await ctx.db.patch(record._id, { status: "failed", failureReason: args.reason, verificationAt: Date.now() });
    return null;
  },
});

async function syncWithdrawalWalletTransaction(ctx: any, withdrawal: any, status: "pending" | "processing" | "paid" | "failed") {
  const existing = await ctx.db.query("walletTransactions")
    .withIndex("by_provider_reference", (q: any) => q.eq("providerReference", withdrawal.reference))
    .unique();
  const transaction = {
    userId: withdrawal.userId,
    amount: -withdrawal.amount,
    type: "withdrawal" as const,
    description: "Wallet withdrawal",
    currency: "NGN" as const,
    status,
    provider: withdrawal.provider,
    providerReference: withdrawal.reference,
  };
  if (existing) {
    await ctx.db.patch(existing._id, transaction);
  } else {
    await ctx.db.insert("walletTransactions", { ...transaction, createdAt: withdrawal.createdAt });
  }
}

export const markWithdrawalPaid = internalMutation({
  args: { withdrawalId: v.id("withdrawals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const withdrawal = await ctx.db.get(args.withdrawalId);
    if (!withdrawal || (withdrawal.status !== "pending" && withdrawal.status !== "processing")) return null;
    const user = await ctx.db.get(withdrawal.userId);
    if (!user) throw new Error("Withdrawal owner not found");
    const reserved = user.walletReserved ?? 0;
    if (reserved < withdrawal.amount || user.walletBalance < withdrawal.amount) throw new Error("Reserved wallet funds are unavailable");
    const now = Date.now();
    await ctx.db.patch(user._id, { walletBalance: user.walletBalance - withdrawal.amount, walletReserved: reserved - withdrawal.amount });
    await ctx.db.patch(withdrawal._id, { status: "paid", processedAt: now });
    await syncWithdrawalWalletTransaction(ctx, withdrawal, "paid");
    return null;
  },
});

export const markWithdrawalFailed = internalMutation({
  args: { withdrawalId: v.id("withdrawals"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const withdrawal = await ctx.db.get(args.withdrawalId);
    if (!withdrawal || withdrawal.status === "paid" || withdrawal.status === "failed") return null;
    const user = await ctx.db.get(withdrawal.userId);
    if (user) await ctx.db.patch(user._id, { walletReserved: Math.max(0, (user.walletReserved ?? 0) - withdrawal.amount) });
    await ctx.db.patch(withdrawal._id, { status: "failed", failureReason: args.reason, processedAt: Date.now() });
    await syncWithdrawalWalletTransaction(ctx, withdrawal, "failed");
    return null;
  },
});
