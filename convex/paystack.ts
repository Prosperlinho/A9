"use node";

import { action, internalAction } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { randomUUID } from "node:crypto";

const paymentStatus = v.union(
  v.literal("pending"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("processing"),
);
const paymentReturn = v.object({
  _id: v.id("payments"), _creationTime: v.number(), rideId: v.id("rides"), studentId: v.id("users"), amount: v.number(),
  riderId: v.optional(v.id("users")),
  currency: v.literal("NGN"), paystackReference: v.string(), status: paymentStatus,
  method: v.optional(v.union(v.literal("paystack"), v.literal("wallet"))),
  ledgerStatus: v.optional(v.union(v.literal("held"), v.literal("released"), v.literal("refunded"))),
  paymentStage: v.optional(v.union(v.literal("unpaid"), v.literal("paid_held"), v.literal("awaiting_completion"), v.literal("eligible_for_rider"), v.literal("pending_payout"), v.literal("paid_to_rider"), v.literal("refunded"), v.literal("disputed"))),
  studentWalletTransactionReference: v.optional(v.string()),
  completionAt: v.optional(v.number()),
  releaseAt: v.optional(v.number()),
  payoutStatus: v.optional(v.union(v.literal("pending"), v.literal("processing"), v.literal("paid"), v.literal("failed"), v.literal("retry"), v.literal("review"))),
  createdAt: v.number(), paidAt: v.optional(v.number()), verificationAt: v.optional(v.number()),
  failureReason: v.optional(v.string()), authorizationUrl: v.optional(v.string()),
});

function secretKey(testOnly = false) {
  const mode = process.env.PAYSTACK_MODE;
  if (testOnly && mode !== "test") throw new Error("Wallet funding is restricted to Paystack test mode.");
  if (mode !== "test" && mode !== "live") {
    throw new Error("Paystack mode is not configured. Set PAYSTACK_MODE to test or live.");
  }
  if (mode === "live" && process.env.PAYSTACK_LIVE_ENABLED !== "true") {
    throw new Error("Live Paystack operations are disabled until explicitly enabled.");
  }
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Paystack is not configured. Set PAYSTACK_SECRET_KEY in Convex environment variables.");
  if (mode === "test" && !key.startsWith("sk_test_")) {
    throw new Error("Test mode requires a Paystack test secret key.");
  }
  if (mode === "live" && !key.startsWith("sk_live_")) {
    throw new Error("Live mode requires a Paystack live secret key.");
  }
  return key;
}

async function paystackRequest(path: string, init: RequestInit, testOnly = false) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secretKey(testOnly)}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = await response.json() as { status?: boolean; message?: string; data?: any };
  if (!response.ok || payload.status !== true) throw new Error(payload.message ?? "Paystack request failed");
  return payload;
}

export const initializeRidePayment = action({
  args: { rideId: v.id("rides") },
  returns: v.object({ payment: paymentReturn, authorizationUrl: v.string() }),
  handler: async (ctx, args): Promise<any> => {
    const studentId = await getAuthUserId(ctx);
    if (!studentId) throw new Error("Sign in required");
    const context: any = await ctx.runQuery(internal.payments.getPaymentContext, { rideId: args.rideId, studentId });
    if (!context) throw new Error("You can only pay for your own student ride");
    const existing: any = context.existingPayment;
    if (existing?.status === "paid") return { payment: existing, authorizationUrl: existing.authorizationUrl ?? "" };
    if (existing?.status === "pending" && existing.authorizationUrl) return { payment: existing, authorizationUrl: existing.authorizationUrl };
    const reference = existing?.paystackReference ?? `A9-${context.rideId}-${Date.now()}`;
    const payment: any = existing ?? await ctx.runMutation(internal.payments.createPendingPayment, {
      rideId: context.rideId, studentId: context.studentId, amount: context.amount, reference,
    });
    try {
      const initialized = await paystackRequest("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({ email: context.email, amount: Math.round(context.amount * 100), currency: "NGN", reference: payment.paystackReference, callback_url: process.env.PAYSTACK_CALLBACK_URL || undefined }),
      });
      const authorizationUrl = initialized.data.authorization_url as string;
      await ctx.runMutation(internal.payments.attachAuthorizationUrl, { paymentId: payment._id, authorizationUrl });
      return { payment: { ...payment, authorizationUrl }, authorizationUrl };
    } catch (error) {
      await ctx.runMutation(internal.payments.markPaymentFailed, { paymentId: payment._id, reason: error instanceof Error ? error.message : "Paystack initialization failed" });
      throw error;
    }
  },
});

export const verifyRidePayment = action({
  args: { rideId: v.id("rides") },
  returns: paymentReturn,
  handler: async (ctx, args): Promise<any> => {
    const studentId = await getAuthUserId(ctx);
    if (!studentId) throw new Error("Sign in required");
    const context: any = await ctx.runQuery(internal.payments.getPaymentContext, { rideId: args.rideId, studentId });
    if (!context?.existingPayment) throw new Error("Payment record not found");
    const payment: any = context.existingPayment;
    if (payment.status === "paid") return payment;
    await ctx.runMutation(internal.payments.markPaymentProcessing, { paymentId: payment._id });
    try {
      const verified = await paystackRequest(`/transaction/verify/${encodeURIComponent(payment.paystackReference)}`, { method: "GET" });
      const data = verified.data as { reference?: string; status?: string; amount?: number; currency?: string };
      if (data.reference !== payment.paystackReference || data.status !== "success") throw new Error("Paystack payment was not successful");
      const result = await ctx.runMutation(internal.payments.markPaymentPaid, { reference: payment.paystackReference, amount: data.amount ?? 0, currency: data.currency ?? "" });
      if (!result.updated && result.reason) throw new Error(result.reason);
    } catch (error) {
      await ctx.runMutation(internal.payments.markPaymentFailed, { paymentId: payment._id, reason: error instanceof Error ? error.message : "Payment verification failed" });
      throw error;
    }
    const refreshed: any = await ctx.runQuery(internal.payments.getPaymentContext, { rideId: args.rideId, studentId });
    if (!refreshed?.existingPayment) throw new Error("Payment record disappeared");
    return refreshed.existingPayment;
  },
});

export const initializeWalletFunding = action({
  args: { amount: v.number() },
  returns: v.object({ fundingId: v.id("walletFundingRequests"), authorizationUrl: v.string(), status: v.string() }),
  handler: async (ctx, args): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required");
    if (!Number.isSafeInteger(args.amount) || args.amount <= 0) throw new Error("Enter a whole-number NGN funding amount greater than zero");
    const callbackUrl = process.env.PAYSTACK_CALLBACK_URL;
    if (!callbackUrl) throw new Error("Production Paystack callback URL is not configured.");
    const parsedCallbackUrl = new URL(callbackUrl);
    if (parsedCallbackUrl.protocol !== "https:") throw new Error("Paystack callback URL must use HTTPS.");
    const reference = `A9-WALLET-${userId}-${randomUUID()}`;
    const fundingId = await ctx.runMutation(internal.payments.createFundingRequest, { userId, amount: args.amount, reference });
    const context: any = await ctx.runQuery(internal.payments.getFundingContext, { fundingId, userId });
    if (!context) throw new Error("Funding request could not be created");
    if (context.status === "verified") return { fundingId, authorizationUrl: "", status: context.status };
    if (context.status === "pending" && context.authorizationUrl) return { fundingId, authorizationUrl: context.authorizationUrl, status: context.status };
    const paystackReference = context.providerReference ?? reference;
    try {
      const initialized = await paystackRequest("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({ email: context.email, amount: context.amount * 100, currency: "NGN", reference: paystackReference, callback_url: callbackUrl }),
      }, true);
      const authorizationUrl = initialized.data?.authorization_url as string | undefined;
      if (!authorizationUrl) throw new Error("Paystack did not return an authorization URL");
      await ctx.runMutation(internal.payments.attachFundingAuthorizationUrl, { fundingId, authorizationUrl });
      return { fundingId, authorizationUrl, status: "pending" };
    } catch (error) {
      await ctx.runMutation(internal.payments.markFundingFailed, { reference: paystackReference, reason: error instanceof Error ? error.message : "Paystack funding initialization failed" });
      throw error;
    }
  },
});

export const verifyWalletFunding = action({
  args: { fundingId: v.id("walletFundingRequests") },
  returns: v.object({ status: v.string() }),
  handler: async (ctx, args): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required");
    const context: any = await ctx.runQuery(internal.payments.getFundingContext, { fundingId: args.fundingId, userId });
    if (!context?.providerReference) throw new Error("Funding request not found");
    if (context.status === "verified") return { status: "verified" };
    return await verifyWalletFundingContext(ctx, context);
  },
});

export const verifyWalletFundingByReference = action({
  args: { reference: v.string() },
  returns: v.object({ status: v.string() }),
  handler: async (ctx, args): Promise<{ status: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required");
    const context: any = await ctx.runQuery(internal.payments.getFundingVerificationContext, { reference: args.reference });
    if (!context || context.userId !== userId) throw new Error("Wallet funding request not found");
    return await verifyWalletFundingContext(ctx, { ...context, providerReference: args.reference });
  },
});

async function verifyWalletFundingContext(ctx: any, context: any): Promise<{ status: string }> {
  if (!context.providerReference) throw new Error("Funding request reference is unavailable");
  if (context.status === "verified") return { status: "verified" };
  if (!Number.isSafeInteger(context.amount) || context.amount <= 0) throw new Error("Funding amount is invalid");
  const verified = await paystackRequest(`/transaction/verify/${encodeURIComponent(context.providerReference)}`, { method: "GET" }, true);
  const data = verified.data as { reference?: string; status?: string; amount?: number; currency?: string };
  if (data.reference !== context.providerReference || data.status !== "success") throw new Error("Paystack funding was not successful");
  if (data.currency !== "NGN" || data.amount !== context.amount * 100) throw new Error("Paystack amount or currency mismatch");
  const result = await ctx.runMutation(internal.payments.markFundingVerified, {
    reference: context.providerReference, amount: data.amount, currency: data.currency,
  });
  if (!result.updated && result.reason) throw new Error(result.reason);
  return { status: "verified" };
}

export const processEligiblePayout = internalAction({
  args: { payoutId: v.id("payouts") },
  returns: v.object({ status: v.string() }),
  handler: async (ctx, args): Promise<{ status: string }> => {
    const payout: any = await ctx.runQuery(internal.payments.getPayoutProcessingContext, { payoutId: args.payoutId });
    if (!payout) {
      await ctx.runMutation(internal.payments.markPayoutReview, { payoutId: args.payoutId, reason: "Payout data is incomplete" });
      return { status: "review" };
    }
    if (payout.status === "paid" || payout.status === "processing") return { status: payout.status };
    if (payout.rideStatus !== "completed" || payout.paymentStatus !== "paid" || payout.paymentStage !== "eligible_for_rider" || payout.verificationStatus !== "approved" || payout.disputeReason) {
      await ctx.runMutation(internal.payments.markPayoutReview, { payoutId: args.payoutId, reason: "Ride, payment, verification, or dispute conditions are not satisfied" });
      return { status: "review" };
    }
    if (process.env.PAYSTACK_MODE !== "test") {
      await ctx.runMutation(internal.payments.markPayoutReview, { payoutId: args.payoutId, reason: "Automated payouts are restricted to Paystack test mode" });
      return { status: "review" };
    }
    if (process.env.PAYSTACK_TRANSFER_ENABLED !== "true" || !process.env.PAYSTACK_TRANSFER_SOURCE) {
      await ctx.runMutation(internal.payments.markPayoutReview, { payoutId: args.payoutId, reason: "Paystack test Transfers are not configured" });
      return { status: "review" };
    }
    const claimed = await ctx.runMutation(internal.payments.markPayoutProcessing, { payoutId: args.payoutId });
    if (!claimed) return { status: "processing" };
    try {
      const recipient = await paystackRequest("/transferrecipient", {
        method: "POST",
        body: JSON.stringify({ type: "nuban", name: payout.accountName, account_number: payout.accountNumber, bank_code: payout.bankCode, currency: "NGN" }),
      });
      const recipientCode = recipient.data?.recipient_code;
      if (!recipientCode) throw new Error("Paystack did not return a transfer recipient");
      await paystackRequest("/transfer", {
        method: "POST",
        body: JSON.stringify({ source: process.env.PAYSTACK_TRANSFER_SOURCE, amount: Math.round(payout.amount * 100), recipient: recipientCode, reason: `A9 rider payout ${payout.reference}`, reference: payout.reference }),
      });
      return { status: "processing" };
    } catch (error) {
      await ctx.runMutation(internal.payments.markPayoutFailed, { payoutId: args.payoutId, reason: error instanceof Error ? error.message : "Paystack transfer failed" });
      return { status: "retry" };
    }
  },
});
