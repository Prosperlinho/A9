"use node";

import { action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const paymentStatus = v.union(
  v.literal("pending"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("processing"),
);
const paymentReturn = v.object({
  _id: v.id("payments"), rideId: v.id("rides"), studentId: v.id("users"), amount: v.number(),
  currency: v.literal("NGN"), paystackReference: v.string(), status: paymentStatus,
  createdAt: v.number(), paidAt: v.optional(v.number()), verificationAt: v.optional(v.number()),
  failureReason: v.optional(v.string()), authorizationUrl: v.optional(v.string()),
});

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Paystack is not configured. Set PAYSTACK_SECRET_KEY in Convex environment variables.");
  return key;
}

async function paystackRequest(path: string, init: RequestInit) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
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
    if (!Number.isFinite(args.amount) || args.amount <= 0) throw new Error("Enter a valid funding amount");
    const reference = `A9-WALLET-${userId}-${Date.now()}`;
    const fundingId = await ctx.runMutation(internal.payments.createFundingRequest, { userId, amount: Math.round(args.amount), reference });
    const context: any = await ctx.runQuery(internal.payments.getFundingContext, { fundingId, userId });
    if (!context) throw new Error("Funding request could not be created");
    if (context.status === "verified") return { fundingId, authorizationUrl: "", status: context.status };
    if (context.status === "pending" && context.authorizationUrl) return { fundingId, authorizationUrl: context.authorizationUrl, status: context.status };
    const paystackReference = context.providerReference ?? reference;
    try {
      const initialized = await paystackRequest("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({ email: context.email, amount: Math.round(context.amount * 100), currency: "NGN", reference: paystackReference, callback_url: process.env.PAYSTACK_CALLBACK_URL || undefined }),
      });
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
    const verified = await paystackRequest(`/transaction/verify/${encodeURIComponent(context.providerReference)}`, { method: "GET" });
    const data = verified.data as { reference?: string; status?: string; amount?: number; currency?: string };
    if (data.reference !== context.providerReference || data.status !== "success") throw new Error("Paystack funding was not successful");
    const result = await ctx.runMutation(internal.payments.markFundingVerified, { reference: context.providerReference, amount: data.amount ?? 0, currency: data.currency ?? "" });
    if (!result.updated && result.reason) throw new Error(result.reason);
    return { status: "verified" };
  },
});
