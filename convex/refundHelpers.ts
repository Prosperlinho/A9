export async function ensurePaystackRideRefund(ctx: any, payment: any, ride: any, now: number) {
  const existing = await ctx.db
    .query("paymentRefunds")
    .withIndex("by_payment", (q: any) => q.eq("paymentId", payment._id))
    .unique();
  if (existing) return existing._id;

  if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0 ||
    !Number.isSafeInteger(payment.amount * 100)) {
    throw new Error("Paystack refund amount is invalid");
  }
  const refundId = await ctx.db.insert("paymentRefunds", {
    paymentId: payment._id,
    rideId: ride._id,
    studentId: payment.studentId,
    amount: payment.amount,
    currency: "NGN",
    transactionReference: payment.paystackReference,
    status: "review",
    reviewReason: "Automatic Paystack refunds are disabled pending confirmation of the provider API contract",
    createdAt: now,
  });
  const reference = `A9-PAYSTACK-REFUND-${String(payment._id)}`;
  const ledgerEntry = await ctx.db
    .query("financialLedger")
    .withIndex("by_reference", (q: any) => q.eq("reference", reference))
    .first();
  if (!ledgerEntry) {
    await ctx.db.insert("financialLedger", {
      kind: "refund",
      direction: "debit",
      userId: payment.studentId,
      rideId: ride._id,
      paymentId: payment._id,
      amount: payment.amount,
      currency: "NGN",
      reference,
      status: "review",
      createdAt: now,
    });
  }
  await ctx.db.insert("auditEvents", {
    category: "financial",
    action: "paystack_refund_requires_review",
    status: "review",
    rideId: ride._id,
    paymentId: payment._id,
    reason: "Automatic Paystack refunds are disabled pending confirmation of the provider API contract",
    createdAt: now,
  });
  return refundId;
}
