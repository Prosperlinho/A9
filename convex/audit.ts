import { internalMutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

export const record = internalMutation({
  args: {
    category: v.union(v.literal("verification"), v.literal("financial"), v.literal("ride")),
    action: v.string(),
    status: v.string(),
    actorId: v.optional(v.id("users")),
    riderId: v.optional(v.id("users")),
    rideId: v.optional(v.id("rides")),
    paymentId: v.optional(v.id("payments")),
    payoutId: v.optional(v.id("payouts")),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("auditEvents", { ...args, createdAt: Date.now() });
    return null;
  },
});

export const listVerificationEvents = query({
  args: { riderId: v.id("users") },
  returns: v.array(v.object({
    action: v.string(), status: v.string(), reason: v.optional(v.string()), createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required");
    const admin = await ctx.db.get(userId);
    if (!admin || admin.role !== "admin") throw new Error("Administrator access required");
    return (await ctx.db.query("auditEvents").withIndex("by_category", (q) => q.eq("category", "verification")).order("desc").take(200))
      .filter((event) => event.riderId === args.riderId)
      .map((event) => ({ action: event.action, status: event.status, reason: event.reason, createdAt: event.createdAt }));
  },
});
