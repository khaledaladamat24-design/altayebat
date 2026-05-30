import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DeliveryProvider } from "@workspace/db";
import { customAdapter, aramexAdapter } from "../stub";
import { DeliveryNotConfiguredError } from "../../types";

// Build a delivery_providers row with sensible defaults for the adapter under
// test. Only the fields the cancel path reads matter here.
function makeProvider(
  overrides: Partial<DeliveryProvider> = {},
): DeliveryProvider {
  return {
    id: 1,
    code: "carrier",
    name: "Carrier",
    nameAr: "الناقل",
    type: "custom",
    baseUrl: null,
    enabled: true,
    isDefault: true,
    contactPhone: null,
    contactWhatsapp: null,
    credentials: {},
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DeliveryProvider;
}

describe("stub adapter cancelShipment (real carrier void)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws DeliveryNotConfiguredError when required credentials are missing", async () => {
    // custom requires apiKey + createUrl + trackUrl; provide none.
    const provider = makeProvider({
      credentials: { cancelUrl: "https://api.carrier.com/void/{tn}" },
    });
    await expect(
      customAdapter.cancelShipment!(provider, "TRK-1"),
    ).rejects.toBeInstanceOf(DeliveryNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws DeliveryNotConfiguredError when configured but no cancel endpoint is wired", async () => {
    // Fully configured for create/track, but no cancelUrl anywhere.
    const provider = makeProvider({
      credentials: {
        apiKey: "tok",
        createUrl: "https://api.carrier.com/create",
        trackUrl: "https://api.carrier.com/track/{tn}",
      },
    });
    await expect(
      customAdapter.cancelShipment!(provider, "TRK-2"),
    ).rejects.toBeInstanceOf(DeliveryNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the carrier's void endpoint with bearer auth and the {tn} substituted", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    const provider = makeProvider({
      credentials: {
        apiKey: "secret-token",
        createUrl: "https://api.carrier.com/create",
        trackUrl: "https://api.carrier.com/track/{tn}",
        cancelUrl: "https://api.carrier.com/shipments/{tn}/cancel",
      },
    });

    await expect(
      customAdapter.cancelShipment!(provider, "AWB 123/45"),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    // {tn} is URL-encoded.
    expect(url).toBe("https://api.carrier.com/shipments/AWB%20123%2F45/cancel");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer secret-token");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ trackingNumber: "AWB 123/45" });
  });

  it("resolves the cancel endpoint from settings when not in credentials", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
    const provider = makeProvider({
      credentials: {
        apiKey: "tok",
        createUrl: "https://api.carrier.com/create",
        trackUrl: "https://api.carrier.com/track/{tn}",
      },
      settings: { cancelUrl: "https://api.carrier.com/void" },
    });

    await customAdapter.cancelShipment!(provider, "TRK-9");
    const [url, init] = fetchMock.mock.calls[0];
    // No {tn} placeholder → URL untouched, tracking number sent in the body.
    expect(url).toBe("https://api.carrier.com/void");
    expect(JSON.parse(init.body)).toEqual({ trackingNumber: "TRK-9" });
  });

  it("throws (surfaced as a 500 by the route) when the carrier rejects the cancel", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => "already delivered",
    });
    const provider = makeProvider({
      credentials: {
        apiKey: "tok",
        createUrl: "https://api.carrier.com/create",
        trackUrl: "https://api.carrier.com/track/{tn}",
        cancelUrl: "https://api.carrier.com/void/{tn}",
      },
    });

    await expect(
      customAdapter.cancelShipment!(provider, "TRK-3"),
    ).rejects.toThrow(/HTTP 422/);
  });

  it("uses basic auth (username/password) for an Aramex-style provider", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    const provider = makeProvider({
      type: "aramex",
      name: "Aramex",
      nameAr: "أرامكس",
      credentials: {
        accountNumber: "20016",
        accountPin: "331421",
        username: "ops@altayebat.com",
        password: "pw",
        accountEntity: "AMM",
        accountCountryCode: "JO",
        cancelUrl: "https://ws.aramex.net/shipping/v1/shipments/{tn}/cancel",
      },
    });

    await aramexAdapter.cancelShipment!(provider, "47384938221");
    const [, init] = fetchMock.mock.calls[0];
    const expected =
      "Basic " + Buffer.from("ops@altayebat.com:pw").toString("base64");
    expect(init.headers.authorization).toBe(expected);
  });
});
