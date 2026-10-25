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
		if (!/^[\da-f]{128}$/i.test(signature)) return new Response("Unauthorized", { status: 401 });
		const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
		const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
		const supplied = Uint8Array.from(signature.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
		const expected = new Uint8Array(digest);
		const valid = expected.every((byte, index) => byte === supplied[index]);
		if (!valid) return new Response("Unauthorized", { status: 401 });
		const event = JSON.parse(body) as { event?: string; data?: { reference?: string; status?: string; amount?: number; currency?: string } };
		const data = event.data;
		if (!data?.reference) return new Response("Ignored", { status: 200 });
		if (event.event === "charge.success" && data.status === "success") {
			if (data.reference.startsWith("A9-WALLET-")) {
				if (process.env.PAYSTACK_MODE !== "test" || !secret.startsWith("sk_test_")) return new Response("Wallet funding is test-mode only", { status: 503 });
				const funding: any = await ctx.runQuery(internal.payments.getFundingVerificationContext, { reference: data.reference });
				if (!funding || funding.status === "verified") return new Response("OK", { status: 200 });
				const verificationResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`, {
					headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
				});
				const verification = await verificationResponse.json() as { status?: boolean; message?: string; data?: { reference?: string; status?: string; amount?: number; currency?: string } };
				if (!verificationResponse.ok || verification.status !== true) return new Response("Paystack verification unavailable", { status: 502 });
				const verified = verification.data;
				if (verified?.reference !== data.reference || verified.status !== "success" || verified.currency !== "NGN" || verified.amount !== funding.amount * 100) {
					return new Response("Paystack transaction did not match the funding request", { status: 400 });
				}
				const result = await ctx.runMutation(internal.payments.markFundingVerified, { reference: data.reference, amount: verified.amount, currency: verified.currency });
				if (!result.updated && result.reason) return new Response(result.reason, { status: 400 });
			} else {
				await ctx.runMutation(internal.payments.markPaymentPaid, { reference: data.reference, amount: data.amount ?? 0, currency: data.currency ?? "" });
			}
		} else if (event.event === "charge.failed") {
			if (data.reference.startsWith("A9-WALLET-")) {
				await ctx.runMutation(internal.payments.markFundingFailed, { reference: data.reference, reason: "Paystack reported a failed charge" });
			} else {
				await ctx.runMutation(internal.payments.markWebhookFailure, { reference: data.reference, reason: "Paystack reported a failed charge" });
			}
		} else if ((event.event === "transfer.success" || event.event === "transfer.failed") && data.reference) {
			await ctx.runMutation(internal.payments.markPayoutProviderResult, { reference: data.reference, status: event.event === "transfer.success" ? "success" : "failed", reason: event.event === "transfer.failed" ? "Paystack reported a failed transfer" : undefined });
		}
		return new Response("OK", { status: 200 });
	}),
});

export default http;
