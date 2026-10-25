import { createAccount } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

type BootstrapResult = { created: boolean; promoted: boolean };
type BootstrapProfile = { _id: Id<"users">; email?: string; role: "student" | "rider" | "admin" };

export const bootstrapAdmin: ReturnType<typeof action> = action({
  args: {
    email: v.string(),
    password: v.string(),
    bootstrapSecret: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.object({ created: v.boolean(), promoted: v.boolean() }),
  handler: async (ctx, args): Promise<BootstrapResult> => {
    const configuredSecret = process.env.A9_ADMIN_BOOTSTRAP_SECRET;
    const configuredEmail = process.env.A9_ADMIN_EMAIL;
    const email = normalizeEmail(args.email);

    if (!configuredSecret || args.bootstrapSecret !== configuredSecret) {
      throw new Error("Administrator bootstrap is not authorized");
    }
    if (!configuredEmail || email !== normalizeEmail(configuredEmail)) {
      throw new Error("Administrator email is not authorized");
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(args.password)) {
      throw new Error("Password must be 8+ characters with uppercase, lowercase, and a number");
    }

    const profile: BootstrapProfile | null = await ctx.runQuery(internal.users.findProfileByEmail, { email });
    const account = await ctx.runQuery(internal.users.findPasswordAccountByEmail, { email });

    if (profile && account) {
      if (profile._id !== account.userId) {
        throw new Error("Administrator email is linked to inconsistent account records");
      }
      await ctx.runMutation(internal.users.promoteProfile, { userId: profile._id });
      return { created: false, promoted: profile.role !== "admin" };
    }
    if (profile || account) {
      throw new Error("Administrator records are incomplete; resolve the account linkage before bootstrapping");
    }

    await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email,
        ...(args.name?.trim() ? { name: args.name.trim() } : {}),
        role: "admin",
        walletBalance: 0,
      },
    });
    return { created: true, promoted: false };
  },
});