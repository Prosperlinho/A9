import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

const earningsStatus = v.union(
  v.literal("pending"),
  v.literal("eligible"),
  v.literal("paid"),
  v.literal("failed"),
);
const earningReturn = v.object({
  _id: v.id("riderEarnings"),
  riderId: v.id("users"),
  rideId: v.id("rides"),
  paymentId: v.id("payments"),
  grossFare: v.number(),
  platformFee: v.number(),
  riderEarnings: v.number(),
  currency: v.literal("NGN"),
  status: earningsStatus,
  createdAt: v.number(),
  completedAt: v.number(),
});

async function currentUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in required");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Account profile not found");
  return user;
}

function startOfDay(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}
function startOfWeek(now: Date) {
  const day = now.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() - mondayOffset);
  return date.getTime();
}
function startOfMonth(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

export const getMyEarnings = query({
  args: {},
  returns: v.object({
    today: v.number(), week: v.number(), month: v.number(), total: v.number(),
    pending: v.number(), payable: v.number(), paid: v.number(), availableForPayout: v.number(), completedRides: v.number(),
    history: v.array(earningReturn),
  }),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user.role !== "rider") throw new Error("Rider access required");
    const earnings = await ctx.db.query("riderEarnings").withIndex("by_rider", (q: any) => q.eq("riderId", user._id)).order("desc").take(100);
    const payoutRequests = await ctx.db.query("payouts").withIndex("by_rider", (q: any) => q.eq("riderId", user._id)).order("desc").take(100);
    const paidOutTotal = payoutRequests.filter((item: any) => item.status === "paid").reduce((sum: number, item: any) => sum + item.amount, 0);
    const pendingPayoutTotal = payoutRequests.filter((item: any) => item.status === "pending" || item.status === "processing" || item.status === "retry").reduce((sum: number, item: any) => sum + item.amount, 0);
    const now = new Date();
    const day = startOfDay(now);
    const week = startOfWeek(now);
    const month = startOfMonth(now);
    const earned = earnings.filter((item: any) => item.status !== "failed");
    const sumSince = (timestamp: number) => earned.filter((item: any) => item.completedAt >= timestamp).reduce((sum: number, item: any) => sum + item.riderEarnings, 0);
    const pending = earnings.filter((item: any) => item.status === "pending").reduce((sum: number, item: any) => sum + item.riderEarnings, 0);
    const availableForPayout = earnings.filter((item: any) => item.status === "eligible").reduce((sum: number, item: any) => sum + item.riderEarnings, 0);
    const paid = earnings.filter((item: any) => item.status === "paid").reduce((sum: number, item: any) => sum + item.riderEarnings, 0);
    return {
      today: sumSince(day),
      week: sumSince(week),
      month: sumSince(month),
      total: earned.reduce((sum: number, item: any) => sum + item.riderEarnings, 0),
      pending,
      payable: pending + availableForPayout + pendingPayoutTotal,
      paid,
      availableForPayout,
      completedRides: earnings.length,
      history: earnings.map((item: any) => ({
        _id: item._id, riderId: item.riderId, rideId: item.rideId, paymentId: item.paymentId,
        grossFare: item.grossFare, platformFee: item.platformFee, riderEarnings: item.riderEarnings,
        currency: item.currency, status: item.status, createdAt: item.createdAt, completedAt: item.completedAt,
      })),
    };
  },
});

export const getAdminEarningsSummary = query({
  args: {},
  returns: v.array(v.object({
    riderId: v.id("users"), riderName: v.optional(v.string()), completedRides: v.number(),
    totalEligible: v.number(), pending: v.number(), paid: v.number(),
  })),
  handler: async (ctx) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const riders = await ctx.db.query("users").withIndex("by_role", (q: any) => q.eq("role", "rider")).take(100);
    return Promise.all(riders.map(async (rider: any) => {
      const earnings = await ctx.db.query("riderEarnings").withIndex("by_rider", (q: any) => q.eq("riderId", rider._id)).take(100);
      const payoutRequests = await ctx.db.query("payouts").withIndex("by_rider", (q: any) => q.eq("riderId", rider._id)).take(100);
      const pendingPayout = payoutRequests.filter((item: any) => item.status === "pending" || item.status === "processing" || item.status === "retry").reduce((sum: number, item: any) => sum + item.amount, 0);
      return {
        riderId: rider._id,
        riderName: rider.name,
        completedRides: earnings.length,
        totalEligible: earnings.filter((item: any) => item.status === "eligible" || item.status === "paid").reduce((sum: number, item: any) => sum + item.riderEarnings, 0),
        pending: earnings.filter((item: any) => item.status === "pending").reduce((sum: number, item: any) => sum + item.riderEarnings, 0) + pendingPayout,
        paid: earnings.filter((item: any) => item.status === "paid").reduce((sum: number, item: any) => sum + item.riderEarnings, 0),
      };
    }));
  },
});
