import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.*s");

describe("authenticated account queries", () => {
  it("creates a default profile and wallet for an authenticated identity with a missing profile", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        role: "student",
        walletBalance: 0,
      });
      await ctx.db.delete(id);
      return id;
    });
    const orphanedIdentity = t.withIdentity({
      subject: String(userId),
      name: "Recovered User",
      email: "RECOVERED@example.com",
    });

    await expect(orphanedIdentity.query(api.users.current, {})).resolves.toBeNull();
    await orphanedIdentity.mutation(api.users.ensureCurrentProfile, {});
    const profile = await orphanedIdentity.query(api.users.current, {});
    expect(profile).toMatchObject({
      name: "Recovered User",
      email: "recovered@example.com",
      role: "student",
      walletBalance: 0,
    });
    await expect(orphanedIdentity.query(api.users.getWallet, {})).resolves.toEqual({
      balance: 0,
      reserved: 0,
      transactions: [],
    });
    await orphanedIdentity.mutation(api.users.ensureCurrentProfile, {});
    await expect(orphanedIdentity.query(api.users.current, {})).resolves.toMatchObject({
      _id: profile?._id,
      role: "student",
      walletBalance: 0,
    });
  });

  it("returns an empty wallet to an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.users.current, {})).resolves.toBeNull();
    await expect(t.mutation(api.users.ensureCurrentProfile, {})).resolves.toBe(false);
    await expect(t.query(api.users.getWallet, {})).resolves.toEqual({
      balance: 0,
      reserved: 0,
      transactions: [],
    });
  });
});
