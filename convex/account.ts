import { action } from "./_generated/server";
import {
  getAuthUserId,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { v } from "convex/values";

export const changePassword = action({
  args: { currentPassword: v.string(), newPassword: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.newPassword.length < 8)
      throw new Error("New password must be at least 8 characters");
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required");
    const user = await ctx.runQuery(
      (await import("./_generated/api")).api.users.current,
    );
    if (!user?.email) throw new Error("Account email not found");
    const account = await retrieveAccount(ctx, {
      provider: "password",
      account: { id: user.email, secret: args.currentPassword },
    });
    if (!account || account.user._id !== userId)
      throw new Error("Current password is incorrect");
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: user.email, secret: args.newPassword },
    });
    return null;
  },
});
