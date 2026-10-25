import { describe, expect, it } from "vitest";
import { normalizeDashboardRides, normalizeDashboardWallet } from "../src/App";

describe("dashboard query data normalization", () => {
  it("drops rides without a valid status and defaults malformed optional ride data", () => {
    const rides = normalizeDashboardRides([
      {
        _id: "ride-1",
        status: "negotiating",
        requestedAt: "invalid",
        pickupLabel: 42,
        destinationLabel: "  Campus  ",
        fare: "invalid",
      },
      { _id: "ride-3", status: "offer_made", requestedAt: 2 },
      { _id: "ride-2" },
      null,
    ]);

    expect(rides).toHaveLength(2);
    expect(rides[0]).toMatchObject({
      _id: "ride-1",
      status: "negotiating",
      requestedAt: 0,
      pickupLabel: "Pickup unavailable",
      destinationLabel: "Campus",
    });
    expect(rides[0].fare).toBeUndefined();
    expect(rides[1]).toMatchObject({
      _id: "ride-3",
      status: "offer_made",
      requestedAt: 2,
    });
  });

  it("provides safe wallet defaults and filters malformed transactions", () => {
    expect(normalizeDashboardWallet({
      balance: Number.NaN,
      reserved: "invalid",
      transactions: [
        { _id: "tx-1", amount: 100, description: "Top up", createdAt: 1, type: "top_up" },
        { _id: "tx-2", amount: "invalid", description: "Bad transaction", createdAt: 2, type: "top_up" },
      ],
    })).toEqual({
      balance: 0,
      reserved: 0,
      transactions: [
        { _id: "tx-1", amount: 100, description: "Top up", createdAt: 1, type: "top_up" },
      ],
    });
  });
});
