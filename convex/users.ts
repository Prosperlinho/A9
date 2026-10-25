import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
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
  v.literal("ride_refund"),
  v.literal("withdrawal"),
  v.literal("cancellation_fee"),
);
const withdrawalStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("paid"),
  v.literal("failed"),
);

export const findProfileByEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      email: v.optional(v.string()),
      role: role,
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();
    return profile
      ? { _id: profile._id, email: profile.email, role: profile.role }
      : null;
  },
});

export const findPasswordAccountByEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.null(), v.object({ _id: v.id("authAccounts"), userId: v.id("users") })),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", args.email),
      )
      .first();
    return account ? { _id: account._id, userId: account.userId } : null;
  },
});

export const promoteProfile = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { role: "admin" });
    return null;
  },
});

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
async function profileForIdentity(ctx: any, identity: any) {
  const userId = await getAuthUserId(ctx);
  const directUser = userId ? await ctx.db.get(userId) : null;
  if (directUser) return directUser;
  const mapping = await ctx.db.query("userIdentityMappings")
    .withIndex("by_subject", (q: any) => q.eq("subject", identity.subject))
    .unique();
  return mapping ? await ctx.db.get(mapping.userId) : null;
}

async function riderRatingSummary(ctx: any, rider: any) {
  if (rider.ratingCount !== undefined) {
    return {
      averageRating: rider.ratingCount
        ? Math.round((rider.ratingTotal ?? 0) / rider.ratingCount * 10) / 10
        : 0,
      ratingCount: rider.ratingCount,
    };
  }
  const ratings = await ctx.db.query("rideRatings")
    .withIndex("by_rider", (q: any) => q.eq("riderId", rider._id))
    .take(500);
  return {
    averageRating: ratings.length
      ? Math.round(ratings.reduce((sum: number, rating: any) => sum + rating.stars, 0) / ratings.length * 10) / 10
      : 0,
    ratingCount: ratings.length,
  };
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
      verificationDecision: v.optional(v.union(v.literal("pass"), v.literal("review"), v.literal("fail"))),
      verificationReason: v.optional(v.string()),
      verificationIdDocument: v.optional(v.id("_storage")),
      verificationSelfie: v.optional(v.id("_storage")),
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
      payoutBankCode: v.optional(v.string()),
      payoutAccountNumber: v.optional(v.string()),
      payoutAccountName: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await profileForIdentity(ctx, identity);
    if (!user) return null;
    const userRole = ["student", "rider", "admin"].includes(user.role) ? user.role : "student";
    const userVerificationStatus = ["not_verified", "under_review", "approved", "rejected"].includes(user.verificationStatus)
      ? user.verificationStatus
      : "not_verified";
    return {
          _id: user._id,
          ...(typeof user.name === "string" ? { name: user.name } : {}),
          ...(typeof user.email === "string" ? { email: user.email } : {}),
          ...(typeof user.phone === "string" ? { phone: user.phone } : {}),
          ...(typeof user.matricNumber === "string" ? { matricNumber: user.matricNumber } : {}),
          ...(typeof user.faculty === "string" ? { faculty: user.faculty } : {}),
          ...(typeof user.department === "string" ? { department: user.department } : {}),
          ...(typeof user.vehicle === "string" ? { vehicle: user.vehicle } : {}),
          ...(typeof user.plateNumber === "string" ? { plateNumber: user.plateNumber } : {}),
          verificationStatus: userVerificationStatus,
          verificationDecision: user.verificationDecision,
          verificationReason: user.verificationReason,
          verificationIdDocument: user.verificationIdDocument,
          verificationSelfie: user.verificationSelfie,
          verificationIdType: user.verificationIdType,
          verificationIdNumber: user.verificationIdNumber,
          verificationDateOfBirth: user.verificationDateOfBirth,
          verificationAddress: user.verificationAddress,
          verificationEmergencyName: user.verificationEmergencyName,
          verificationEmergencyPhone: user.verificationEmergencyPhone,
          verificationSubmittedAt: user.verificationSubmittedAt,
          verificationReviewedAt: user.verificationReviewedAt,
          verificationRejectionReason: user.verificationRejectionReason,
          ...(typeof user.isOnline === "boolean" ? { isOnline: user.isOnline } : {}),
          role: userRole,
          walletBalance: Number.isFinite(user.walletBalance) ? user.walletBalance : 0,
          payoutBankName: user.payoutBankName,
          payoutBankCode: user.payoutBankCode,
          payoutAccountNumber: user.payoutAccountNumber,
          payoutAccountName: user.payoutAccountName,
        };
  },
});

export const ensureCurrentProfile = mutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const existing = await profileForIdentity(ctx, identity);
    if (existing) return true;

    const staleMapping = await ctx.db.query("userIdentityMappings")
      .withIndex("by_subject", (q: any) => q.eq("subject", identity.subject))
      .unique();
    const userId = await ctx.db.insert("users", {
      ...(typeof identity.name === "string" ? { name: identity.name } : {}),
      ...(typeof identity.email === "string" ? { email: identity.email.trim().toLowerCase() } : {}),
      role: "student",
      walletBalance: 0,
    });
    if (staleMapping) {
      await ctx.db.patch(staleMapping._id, { userId });
    } else {
      await ctx.db.insert("userIdentityMappings", {
        subject: identity.subject,
        userId,
      });
    }
    return true;
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
    if (user.verificationStatus === "approved" || user.verificationStatus === "under_review")
      throw new Error("An active verification submission already exists");
    if (!args.idNumber.trim() || !args.dateOfBirth || !args.address.trim() || !args.emergencyName.trim())
      throw new Error("Complete all verification details");
    if (!user.name?.trim() || !user.phone?.trim() || !user.email?.trim())
      throw new Error("Complete your rider profile before submitting verification");
    const duplicate = await ctx.db.query("users")
      .withIndex("verification_id_number", (q: any) => q.eq("verificationIdNumber", args.idNumber.trim()))
      .first();
    if (duplicate && duplicate._id !== user._id && duplicate.verificationStatus === "approved")
      throw new Error("This identity number is already associated with a verified rider");
    const idMetadata = await ctx.storage.getMetadata(args.idDocument);
    const selfieMetadata = await ctx.storage.getMetadata(args.selfie);
    if (!idMetadata || !selfieMetadata) throw new Error("Verification files could not be found");
    if (!idMetadata.contentType?.startsWith("image/") && idMetadata.contentType !== "application/pdf")
      throw new Error("Government ID must be an image or PDF");
    if (!selfieMetadata.contentType?.startsWith("image/"))
      throw new Error("Selfie must be an image");
    await ctx.db.patch(user._id, {
      verificationStatus: "under_review",
      verificationDecision: "review",
      verificationReason: "Automated checks passed, but document authenticity requires manual review.",
      verificationProcessedAt: Date.now(),
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
    await ctx.runMutation(internal.audit.record, {
      category: "verification", action: "verification_submitted", status: "review",
      riderId: user._id, reason: "Automated checks passed; manual identity review required.",
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
    averageRating: v.number(), ratingCount: v.number(),
    verificationStatus, verificationIdType: v.optional(v.string()), verificationIdNumber: v.optional(v.string()),
    verificationIdDocument: v.optional(v.id("_storage")), verificationSelfie: v.optional(v.id("_storage")),
    verificationDateOfBirth: v.optional(v.string()), verificationAddress: v.optional(v.string()),
    verificationEmergencyName: v.optional(v.string()), verificationEmergencyPhone: v.optional(v.string()),
    verificationSubmittedAt: v.optional(v.number()), verificationReviewedAt: v.optional(v.number()),
    verificationRejectionReason: v.optional(v.string()),
    verificationDecision: v.optional(v.union(v.literal("pass"), v.literal("review"), v.literal("fail"))),
    verificationReason: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const riders = await ctx.db.query("users").withIndex("by_role", (q: any) => q.eq("role", "rider")).take(100);
    const status = args;
    return Promise.all(riders.filter((user: any) => {
      const matchesStatus = !status.status || (user.verificationStatus ?? "not_verified") === status.status;
      const search = status.search?.trim().toLowerCase();
      const matchesSearch = !search || [user.name, user.email, user.phone].some((value) => value?.toLowerCase().includes(search));
      return matchesStatus && matchesSearch;
    }).map(async (user: any) => ({
      _id: user._id, name: user.name, email: user.email, phone: user.phone,
      ...await riderRatingSummary(ctx, user),
      verificationStatus: user.verificationStatus ?? "not_verified", verificationIdType: user.verificationIdType,
      verificationIdNumber: user.verificationIdNumber, verificationIdDocument: user.verificationIdDocument,
      verificationSelfie: user.verificationSelfie, verificationDateOfBirth: user.verificationDateOfBirth,
      verificationAddress: user.verificationAddress, verificationEmergencyName: user.verificationEmergencyName,
      verificationEmergencyPhone: user.verificationEmergencyPhone, verificationSubmittedAt: user.verificationSubmittedAt,
      verificationReviewedAt: user.verificationReviewedAt, verificationRejectionReason: user.verificationRejectionReason,
      verificationDecision: user.verificationDecision, verificationReason: user.verificationReason,
    })));
  },
});

export const getVerificationDetails = query({
  args: { riderId: v.id("users") },
  returns: v.union(v.null(), v.object({
    _id: v.id("users"), name: v.optional(v.string()), email: v.optional(v.string()), phone: v.optional(v.string()),
    averageRating: v.number(), ratingCount: v.number(),
    verificationStatus, verificationIdType: v.optional(v.string()), verificationIdNumber: v.optional(v.string()),
    verificationDateOfBirth: v.optional(v.string()), verificationAddress: v.optional(v.string()),
    verificationEmergencyName: v.optional(v.string()), verificationEmergencyPhone: v.optional(v.string()),
    verificationSubmittedAt: v.optional(v.number()), verificationReviewedAt: v.optional(v.number()),
    verificationRejectionReason: v.optional(v.string()), verificationReviewerId: v.optional(v.id("users")),
    verificationDecision: v.optional(v.union(v.literal("pass"), v.literal("review"), v.literal("fail"))), verificationReason: v.optional(v.string()),
    idDocumentUrl: v.optional(v.string()), idDocumentContentType: v.optional(v.string()), selfieUrl: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const admin = await currentUser(ctx);
    if (admin.role !== "admin") throw new Error("Administrator access required");
    const rider = await ctx.db.get(args.riderId);
    if (!rider || rider.role !== "rider") throw new Error("Rider account not found");
    const ratings = await riderRatingSummary(ctx, rider);
    return {
      _id: rider._id, name: rider.name, email: rider.email, phone: rider.phone,
      ...ratings,
      verificationStatus: rider.verificationStatus ?? "not_verified", verificationIdType: rider.verificationIdType,
      verificationIdNumber: rider.verificationIdNumber, verificationDateOfBirth: rider.verificationDateOfBirth,
      verificationAddress: rider.verificationAddress, verificationEmergencyName: rider.verificationEmergencyName,
      verificationEmergencyPhone: rider.verificationEmergencyPhone, verificationSubmittedAt: rider.verificationSubmittedAt,
      verificationReviewedAt: rider.verificationReviewedAt, verificationRejectionReason: rider.verificationRejectionReason,
      verificationDecision: rider.verificationDecision, verificationReason: rider.verificationReason,
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
      verificationDecision: args.decision === "approved" ? "pass" : "fail",
      verificationReason: args.rejectionReason?.trim() ?? "Manually reviewed by an administrator",
      verificationReviewedAt: Date.now(),
      verificationReviewerId: admin._id,
      verificationRejectionReason: args.decision === "rejected" ? args.rejectionReason?.trim() : undefined,
    });
    await ctx.runMutation(internal.audit.record, {
      category: "verification", action: "verification_manual_decision", status: args.decision,
      actorId: admin._id, riderId: rider._id, reason: args.rejectionReason?.trim(),
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
    payoutBankCode: v.optional(v.string()),
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
      if (args.payoutBankCode !== undefined) riderProfile.payoutBankCode = args.payoutBankCode.trim();
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
    if (args.isOnline && user.verificationStatus !== "approved") {
      throw new Error("Account Verification Required");
    }
    await ctx.db.patch(user._id, { isOnline: args.isOnline });
    if (!args.isOnline) {
      const offers = await ctx.db.query("rideOffers")
        .withIndex("by_rider", (q: any) => q.eq("riderId", user._id))
        .order("desc")
        .take(100);
      for (const offer of offers) {
        if (offer.status !== "submitted") continue;
        const ride: any = await ctx.db.get(offer.rideId);
        if (!ride || typeof ride.userId !== "string" || ride.status !== "requested" ||
          (ride.requestStatus !== "searching" && ride.requestStatus !== "offers_available")) continue;
        const now = Date.now();
        await ctx.db.patch(offer._id, { status: "withdrawn", updatedAt: now });
        await ctx.db.insert("notifications", {
          userId: ride.userId,
          type: "offer_closed",
          title: "Rider offer withdrawn",
          body: `${user.name ?? "An A9 rider"} is no longer available for this request.`,
          rideId: ride._id,
          offerId: offer._id,
          destination: "dashboard",
          createdAt: now,
        });
      }
    }
    return null;
  },
});
export const listRiders = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const customer = await currentUser(ctx);
    if (customer.role !== "student") throw new Error("Customer access required");
    const riders = await ctx.db.query("users")
      .withIndex("by_role", (q: any) => q.eq("role", "rider"))
      .take(50);
    return riders.map((rider: any) => ({ _id: rider._id, name: rider.name }));
  },
});
export const getWallet = query({
  args: {},
  returns: v.object({
    balance: v.number(),
    reserved: v.number(),
    transactions: v.array(
      v.object({
        _id: v.string(),
        userId: v.id("users"),
        amount: v.number(),
        type: transactionType,
        description: v.string(),
        rideId: v.optional(v.id("rides")),
        currency: v.optional(v.literal("NGN")),
        status: v.optional(v.string()),
        createdAt: v.number(),
        provider: v.optional(v.string()),
        providerReference: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { balance: 0, reserved: 0, transactions: [] };
    const user = await profileForIdentity(ctx, identity);
    if (!user) return { balance: 0, reserved: 0, transactions: [] };
    const walletTransactions = (
      await ctx.db
        .query("walletTransactions")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .order("desc")
        .take(100)
    ).map((item: any) => ({
      _id: item._id,
      userId: item.userId,
      amount: item.amount,
      type: item.type,
      description: item.description,
      rideId: item.rideId,
      currency: item.currency,
      status: item.status,
      createdAt: item.createdAt,
      provider: item.provider,
      providerReference: item.providerReference,
    }));
    const withdrawals = await ctx.db.query("withdrawals")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
    const representedWithdrawalReferences = new Set(walletTransactions
      .filter((transaction: any) => transaction.type === "withdrawal" && transaction.providerReference)
      .map((transaction: any) => transaction.providerReference));
    const legacyWithdrawalTransactions = withdrawals
      .filter((withdrawal: any) => !representedWithdrawalReferences.has(withdrawal.reference))
      .map((withdrawal: any) => ({
        _id: `withdrawal:${String(withdrawal._id)}`,
        userId: withdrawal.userId,
        amount: -withdrawal.amount,
        type: "withdrawal" as const,
        description: "Wallet withdrawal",
        currency: withdrawal.currency,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt,
        provider: withdrawal.provider,
        providerReference: withdrawal.reference,
      }));
    const riderEarnings = user.role === "rider"
      ? (await ctx.db.query("riderEarnings").withIndex("by_rider", (q: any) => q.eq("riderId", user._id)).order("desc").take(50)).map((earning: any) => ({
          _id: `earning:${String(earning._id)}`,
          userId: earning.riderId,
          amount: earning.riderEarnings,
          type: "ride_earning" as const,
          description: `Ride earning · ${String(earning.rideId).slice(-8)}`,
          rideId: earning.rideId,
          currency: earning.currency,
          status: earning.status,
          createdAt: earning.completedAt,
          provider: "a9_wallet",
          providerReference: `A9-EARNINGS-${String(earning.rideId)}`,
        }))
      : [];
    const transactions = [...walletTransactions, ...legacyWithdrawalTransactions, ...riderEarnings]
      .sort((first: any, second: any) => second.createdAt - first.createdAt)
      .slice(0, 50);
    const reserved = Number.isFinite(user.walletReserved) ? user.walletReserved : 0;
    const balance = Number.isFinite(user.walletBalance) ? user.walletBalance : 0;
    return { balance: Math.max(0, balance - reserved), reserved, transactions };
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
    await ctx.db.insert("walletTransactions", {
      userId: user._id,
      amount: -amount,
      type: "withdrawal",
      description: "Wallet withdrawal",
      currency: "NGN",
      status: "pending",
      createdAt: now,
      provider: "not_configured",
      providerReference: reference,
    });
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
