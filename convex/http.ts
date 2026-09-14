import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components, internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);
registerStaticRoutes(http, components.staticHosting);

http.route({
	path: "/paystack/webhook",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const secret = process.env.PAYSTACK_SECRET_KEY;
		const signature = request.headers.get("x-paystack-signature");
		const body = await request.text();
		if (!secret || !signature) return new Response("Unauthorized", { status: 401 });
		const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
		const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
		const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
		const valid = signature.length === expected.length && [...signature].every((character, index) => character === expected[index]);
		if (!valid) return new Response("Unauthorized", { status: 401 });
		const event = JSON.parse(body) as { event?: string; data?: { reference?: string; status?: string; amount?: number; currency?: string } };
		const data = event.data;
		if (!data?.reference) return new Response("Ignored", { status: 200 });
		if (event.event === "charge.success" && data.status === "success") {
			if (data.reference.startsWith("A9-WALLET-")) {
				await ctx.runMutation(internal.payments.markFundingVerified, { reference: data.reference, amount: data.amount ?? 0, currency: data.currency ?? "" });
			} else {
				await ctx.runMutation(internal.payments.markPaymentPaid, { reference: data.reference, amount: data.amount ?? 0, currency: data.currency ?? "" });
			}
		} else if (event.event === "charge.failed") {
			if (data.reference.startsWith("A9-WALLET-")) {
				await ctx.runMutation(internal.payments.markFundingFailed, { reference: data.reference, reason: "Paystack reported a failed charge" });
			} else {
				await ctx.runMutation(internal.payments.markWebhookFailure, { reference: data.reference, reason: "Paystack reported a failed charge" });
			}
		}
		return new Response("OK", { status: 200 });
	}),
});

export default http;
