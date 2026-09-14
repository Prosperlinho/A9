import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

const verificationStatus = v.union(
  v.literal("not_verified"),
  v.literal("under_review"),
  v.literal("approved"),
  v.literal("rejected"),
);

const role = v.union(
  v.literal("student"),
  v.literal("rider"),
  v.literal("admin"),
);
const transactionType = v.union(
  v.literal("ride_charge"),
  v.literal("top_up"),
  v.literal("ride_earning"),
);
const withdrawalStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("paid"),
  v.literal("failed"),
);

async function currentUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in required");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Account profile not found");
  return user;
}

export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      matricNumber: v.optional(v.string()),
      faculty: v.optional(v.string()),
      department: v.optional(v.string()),
      vehicle: v.optional(v.string()),
      plateNumber: v.optional(v.string()),
      verificationStatus,
      verificationIdType: v.optional(v.string()),
      verificationIdNumber: v.optional(v.string()),
      verificationDateOfBirth: v.optional(v.string()),
      verificationAddress: v.optional(v.string()),
      verificationEmergencyName: v.optional(v.string()),
      verificationEmergencyPhone: v.optional(v.string()),
      verificationSubmittedAt: v.optional(v.number()),
      verificationReviewedAt: v.optional(v.number()),
      verificationRejectionReason: v.optional(v.string()),
      isOnline: v.optional(v.boolean()),
      role,
      walletBalance: v.number(),
      payoutBankName: v.optional(v.string()),
      payoutAccountNumber: v.optional(v.string()),
      payoutAccountName: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return user
      ? {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          matricNumber: user.matricNumber,
          faculty: user.faculty,
          department: user.department,
          vehicle: user.vehicle,
          plateNumber: user.plateNumber,
          verificationStatus: user.verificationStatus ?? "not_verified",
          verificationIdType: user.verificationIdType,
          verificationIdNumber: user.verificationIdNumber,
          verificationDateOfBirth: user.verificationDateOfBirth,
          verificationAddress: user.verificationAddress,
          verificationEmergencyName: user.verificationEmergencyName,
          verificationEmergencyPhone: user.verificationEmergencyPhone,
          verificationSubmittedAt: user.verificationSubmittedAt,
          verificationReviewedAt: user.verificationReviewedAt,
          verificationRejectionReason: user.verificationRejectionReason,
          isOnline: user.isOnline,
          role: user.role,
          walletBalance: user.walletBalance,
          payoutBankName: user.payoutBankName,
          payoutAccountNumber: user.payoutAccountNumber,
          payoutAccountName: user.payoutAccountName,
        }
      : null;
  },
});

export const generateVerificationUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user.role !== "rider") throw new Error("Rider access required");
    return await ctx.storage.generateUploadUrl();
  },
});

export const submitVerification = mutation({
  args: {
    idType: v.union(v.literal("national_id"), v.literal("voters_card"), v.literal("passport")),
    idNumber: v.string(),
    idDocument: v.id("_storage"),
    selfie: v.id("_storage"),
    dateOfBirth: v.string(),
    address: v.string(),
    emergencyName: v.string(),
    emergencyPhone: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (user.role !== "rider") throw new Error("Rider access required");
    if (!args.idNumber.trim() || !args.dateOfBirth || !args.address.trim() || !args.emergencyName.trim())
      throw new Error("Complete all verification details");
    const idMetadata = await ctx.storage.getMetadata(args.idDocument);
    const selfieMetadata = await ctx.storage.getMetadata(args.selfie);
    if (!idMetadata || !selfieMetadata) throw new Error("Verification files could not be found");
    if (!idMetadata.contentType?.startsWith("image/") && idMetadata.contentType !== "application/pdf")
      throw new Error("Government ID must be an image or PDF");
    if (!selfieMetadata.contentType?.startsWith("image/"))
      throw new Error("Selfie must be an image");
    await ctx.db.patch(user._id, {
      verificationStatus: "under_review",
      verificationIdType: args.idType,
      verificationIdNumber: args.idNumber.trim(),
      verificationIdDocument: args.idDocument,
      verificationSelfie: args.selfie,
      verificationDateOfBirth: args.dateOfBirth,
      verificationAddress: args.address.trim(),
      verificationEmergencyName: args.emergencyName.trim(),
      verificationEmergencyPhone: args.emergencyPhone.trim(),
      verificationSubmittedAt: Date.now(),
      verificationReviewedAt: undefined,
      verificationRejectionReason: undefined,
      verificationReviewerId: undefined,
    });
    return null;
  },
});

export const listVerificationSubmissions = query({
  args: {
    status: v.optional(verificationStatus),
    search: v.optional(v.string()),
  },
  returns: v.array(v.object({
    _id: v.id("users"), name: v.optional(v.string()), email: v.optional(v.string()), phone: v.optional(v.string()),
    verificationStatus, verificationIdType: v.optional(v.string()), verificationIdNumber: v.optional(v.string()),
    verificationIdDocument: v.optional(v.id("_storage")), verificationSelfie: v.optional(v.id("_storage")),
    verificationDateOfBirth: v.optional(v.string()), verificationAddress: v.optional(v.string()),
    verificationEmergencyName: v.optional(v.string()), verificationEmergencyPhone: v.optional(v.string()),
    verificationSubmittedAt: v.optional(v.number()), verificationReviewedAt: v.optional(v.number()),
    verificationRejectionReason: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const riders = await ctx.db.query("users").withIndex("by_role", (q: any) => q.eq("role", "rider")).take(100);
    const status = args;
    return riders.filter((user: any) => {
      const matchesStatus = !status.status || (user.verificationStatus ?? "not_verified") === status.status;
      const search = status.search?.trim().toLowerCase();
      const matchesSearch = !search || [user.name, user.email, user.phone].some((value) => value?.toLowerCase().includes(search));
      return matchesStatus && matchesSearch;
    }).map((user: any) => ({
      _id: user._id, name: user.name, email: user.email, phone: user.phone,
      verificationStatus: user.verificationStatus ?? "not_verified", verificationIdType: user.verificationIdType,
      verificationIdNumber: user.verificationIdNumber, verificationIdDocument: user.verificationIdDocument,
      verificationSelfie: user.verificationSelfie, verificationDateOfBirth: user.verificationDateOfBirth,
      verificationAddress: user.verificationAddress, verificationEmergencyName: user.verificationEmergencyName,
      verificationEmergencyPhone: user.verificationEmergencyPhone, verificationSubmittedAt: user.verificationSubmittedAt,
      verificationReviewedAt: user.verificationReviewedAt, verificationRejectionReason: user.verificationRejectionReason,
    }));
  },
});

export const getVerificationDetails = query({
  args: { riderId: v.id("users") },
  returns: v.union(v.null(), v.object({
    _id: v.id("users"), name: v.optional(v.string()), email: v.optional(v.string()), phone: v.optional(v.string()),
    verificationStatus, verificationIdType: v.optional(v.string()), verificationIdNumber: v.optional(v.string()),
    verificationDateOfBirth: v.optional(v.string()), verificationAddress: v.optional(v.string()),
    verificationEmergencyName: v.optional(v.string()), verificationEmergencyPhone: v.optional(v.string()),
    verificationSubmittedAt: v.optional(v.number()), verificationReviewedAt: v.optional(v.number()),
    verificationRejectionReason: v.optional(v.string()), verificationReviewerId: v.optional(v.id("users")),
    idDocumentUrl: v.optional(v.string()), idDocumentContentType: v.optional(v.string()), selfieUrl: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const rider = await ctx.db.get(args.riderId);
    if (!rider || rider.role !== "rider") throw new Error("Rider account not found");
    return {
      _id: rider._id, name: rider.name, email: rider.email, phone: rider.phone,
      verificationStatus: rider.verificationStatus ?? "not_verified", verificationIdType: rider.verificationIdType,
      verificationIdNumber: rider.verificationIdNumber, verificationDateOfBirth: rider.verificationDateOfBirth,
      verificationAddress: rider.verificationAddress, verificationEmergencyName: rider.verificationEmergencyName,
      verificationEmergencyPhone: rider.verificationEmergencyPhone, verificationSubmittedAt: rider.verificationSubmittedAt,
      verificationReviewedAt: rider.verificationReviewedAt, verificationRejectionReason: rider.verificationRejectionReason,
      verificationReviewerId: rider.verificationReviewerId,
      idDocumentUrl: rider.verificationIdDocument ? await ctx.storage.getUrl(rider.verificationIdDocument) ?? undefined : undefined,
      idDocumentContentType: rider.verificationIdDocument ? (await ctx.storage.getMetadata(rider.verificationIdDocument))?.contentType ?? undefined : undefined,
      selfieUrl: rider.verificationSelfie ? await ctx.storage.getUrl(rider.verificationSelfie) ?? undefined : undefined,
    };
  },
});

export const reviewVerification = mutation({
  args: { riderId: v.id("users"), decision: v.union(v.literal("approved"), v.literal("rejected")), rejectionReason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const rider = await ctx.db.get(args.riderId);
    if (!rider || rider.role !== "rider") throw new Error("Rider account not found");
    if (args.decision === "rejected" && !args.rejectionReason?.trim()) throw new Error("A rejection reason is required");
    await ctx.db.patch(args.riderId, {
      verificationStatus: args.decision,
      verificationReviewedAt: Date.now(),
      verificationReviewerId: admin._id,
      verificationRejectionReason: args.decision === "rejected" ? args.rejectionReason?.trim() : undefined,
    });
    return null;
  },
});

export const updateProfile = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    matricNumber: v.optional(v.string()),
    faculty: v.optional(v.string()),
    department: v.optional(v.string()),
    vehicle: v.optional(v.string()),
    plateNumber: v.optional(v.string()),
    payoutBankName: v.optional(v.string()),
    payoutAccountNumber: v.optional(v.string()),
    payoutAccountName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const profile = {
      name: args.name.trim(),
      phone: args.phone.trim(),
    };
    if (user.role === "student") {

      const studentProfile: Record<string, string> = { ...profile };
      if (args.matricNumber !== undefined) studentProfile.matricNumber = args.matricNumber.trim();
      if (args.faculty !== undefined) studentProfile.faculty = args.faculty.trim();
      if (args.department !== undefined) studentProfile.department = args.department.trim();
      await ctx.db.patch(user._id, studentProfile);
    } else if (user.role === "rider") {
      const riderProfile: Record<string, string> = { ...profile };
      if (args.vehicle !== undefined) riderProfile.vehicle = args.vehicle.trim();
      if (args.plateNumber !== undefined) riderProfile.plateNumber = args.plateNumber.trim().toUpperCase();
      if (args.payoutBankName !== undefined) riderProfile.payoutBankName = args.payoutBankName.trim();
      if (args.payoutAccountNumber !== undefined) riderProfile.payoutAccountNumber = args.payoutAccountNumber.trim();
      if (args.payoutAccountName !== undefined) riderProfile.payoutAccountName = args.payoutAccountName.trim();
      await ctx.db.patch(user._id, riderProfile);
    } else {
      await ctx.db.patch(user._id, profile);
    }
    return null;
  },
});
export const setRiderAvailability = mutation({
  args: { isOnline: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (user.role !== "rider") throw new Error("Only riders can change availability");
    await ctx.db.patch(user._id, { isOnline: args.isOnline });
    return null;
  },
});
export const listRiders = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      role,
      walletBalance: v.number(),
      vehicle: v.optional(v.string()),
      isOnline: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("users")
        .withIndex("by_role", (q: any) => q.eq("role", "rider"))
        .take(50)
    ).map((user: any) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      walletBalance: user.walletBalance,
      vehicle: user.vehicle,
      isOnline: user.isOnline,
    })),
});
export const getWallet = query({
  args: {},
  returns: v.object({
    balance: v.number(),
    reserved: v.number(),
    transactions: v.array(
      v.object({
        _id: v.id("walletTransactions"),
        userId: v.id("users"),
        amount: v.number(),
        type: transactionType,
        description: v.string(),
        rideId: v.optional(v.id("rides")),
        createdAt: v.number(),
        provider: v.optional(v.string()),
        providerReference: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    const transactions = (
      await ctx.db
        .query("walletTransactions")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .order("desc")
        .take(50)
    ).map((item: any) => ({
      _id: item._id,
      userId: item.userId,
      amount: item.amount,
      type: item.type,
      description: item.description,
      rideId: item.rideId,
      createdAt: item.createdAt,
      provider: item.provider,
      providerReference: item.providerReference,
    }));
    return { balance: Math.max(0, user.walletBalance - (user.walletReserved ?? 0)), reserved: user.walletReserved ?? 0, transactions };
  },
});

export const listMyWithdrawals = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("withdrawals"), amount: v.number(), currency: v.literal("NGN"), bankName: v.string(),
    accountNumber: v.string(), accountName: v.string(), status: withdrawalStatus, createdAt: v.number(),
    processedAt: v.optional(v.number()), failureReason: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    const withdrawals = await ctx.db.query("withdrawals").withIndex("by_user", (q: any) => q.eq("userId", user._id)).order("desc").take(30);
    return withdrawals.map((item: any) => ({
      _id: item._id, amount: item.amount, currency: item.currency, bankName: item.bankName,
      accountNumber: `****${item.accountNumber.slice(-4)}`, accountName: item.accountName, status: item.status,
      createdAt: item.createdAt, processedAt: item.processedAt, failureReason: item.failureReason,
    }));
  },
});

export const requestWithdrawal = mutation({
  args: { amount: v.number(), bankName: v.string(), accountNumber: v.string(), accountName: v.string() },
  returns: v.id("withdrawals"),
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (user.role !== "student") throw new Error("Only students can withdraw from this wallet");
    const amount = Math.round(args.amount);
    const bankName = args.bankName.trim();
    const accountNumber = args.accountNumber.trim();
    const accountName = args.accountName.trim();
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Withdrawal amount must be greater than zero");
    if (amount > Math.max(0, user.walletBalance - (user.walletReserved ?? 0))) throw new Error("Withdrawal exceeds available balance");
    if (bankName.length < 2 || accountName.length < 2 || !/^\d{10}$/.test(accountNumber)) throw new Error("Enter a valid Nigerian bank name, 10-digit account number, and account name");
    const now = Date.now();
    const reference = `A9-WITHDRAWAL-${user._id}-${now}`;
    const withdrawalId = await ctx.db.insert("withdrawals", {
      userId: user._id, amount, currency: "NGN", bankName, accountNumber, accountName,
      status: "pending", provider: "not_configured", reference, createdAt: now,
    });
    await ctx.db.patch(user._id, { walletReserved: (user.walletReserved ?? 0) + amount });
    return withdrawalId;
  },
});
export const requestFunding = mutation({
  args: { amount: v.number() },
  returns: v.id("walletFundingRequests"),
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (args.amount <= 0) throw new Error("Enter a valid amount");
    return await ctx.db.insert("walletFundingRequests", {
      userId: user._id,
      amount: args.amount,
      currency: "NGN",
      status: "pending",
      provider: "not_configured",
      createdAt: Date.now(),
    });
  },
});
