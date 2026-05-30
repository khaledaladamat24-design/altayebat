import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DeliveryProvider, Order } from "@workspace/db";
import { customAdapter, aramexAdapter } from "../stub";
import { DeliveryNotConfiguredError } from "../../types";
import type { ShipmentInput } from "../../types";

// Build a delivery_providers row with sensible defaults for the adapter under
// test. Only the fields the create/track paths read matter here.
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

function makeInput(overrides: Partial<ShipmentInput> = {}): ShipmentInput {
  return {
    order: { id: 42 } as Order,
    recipientName: "نور",
    recipientPhone: "0791234567",
    recipientAddress: "عمان، الأردن",
    recipientCity: "Amman",
    totalCod: 18.5,
    notes: "اطرق الباب",
    ...overrides,
  };
}

const fullCustomCreds = {
  apiKey: "secret-token",
  createUrl: "https://api.carrier.com/create",
  trackUrl: "https://api.carrier.com/track/{tn}",
};

describe("stub adapter createShipment (real carrier booking)", () => {
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
    const provider = makeProvider({ credentials: {} });
    await expect(
      customAdapter.createShipment(provider, makeInput()),
    ).rejects.toBeInstanceOf(DeliveryNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws DeliveryNotConfiguredError when configured but no create endpoint is wired", async () => {
    // aramex is fully credentialed, but no createUrl anywhere.
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
      },
    });
    await expect(
      aramexAdapter.createShipment(provider, makeInput()),
    ).rejects.toBeInstanceOf(DeliveryNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to the create endpoint with bearer auth and returns the AWB + label", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        trackingNumber: "AWB-998877",
        awbUrl: "https://api.carrier.com/labels/998877.pdf",
        status: "booked",
      }),
    });
    const provider = makeProvider({ credentials: fullCustomCreds });

    const result = await customAdapter.createShipment(provider, makeInput());

    expect(result).toEqual({
      trackingNumber: "AWB-998877",
      awbUrl: "https://api.carrier.com/labels/998877.pdf",
      status: "booked",
      raw: {
        trackingNumber: "AWB-998877",
        awbUrl: "https://api.carrier.com/labels/998877.pdf",
        status: "booked",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.carrier.com/create");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer secret-token");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      orderId: 42,
      recipientName: "نور",
      recipientPhone: "0791234567",
      recipientAddress: "عمان، الأردن",
      recipientCity: "Amman",
      codAmount: 18.5,
      notes: "اطرق الباب",
    });
  });

  it("accepts snake_case / numeric aliases for the tracking number and defaults status", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ awb: 553311 }),
    });
    const provider = makeProvider({ credentials: fullCustomCreds });

    const result = await customAdapter.createShipment(provider, makeInput());
    expect(result.trackingNumber).toBe("553311");
    expect(result.awbUrl).toBeNull();
    expect(result.status).toBe("shipped");
  });

  it("throws when the carrier returns 2xx but no tracking number", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "queued" }),
    });
    const provider = makeProvider({ credentials: fullCustomCreds });

    await expect(
      customAdapter.createShipment(provider, makeInput()),
    ).rejects.toThrow(/no tracking number/);
  });

  it("throws (surfaced as a 500 by the route) when the carrier rejects the booking", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => "invalid address",
    });
    const provider = makeProvider({ credentials: fullCustomCreds });

    await expect(
      customAdapter.createShipment(provider, makeInput()),
    ).rejects.toThrow(/HTTP 422/);
  });

  it("resolves the create endpoint from settings and uses basic auth (Aramex-style)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ tracking_number: "ARX-1" }),
    });
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
        trackUrl: "https://ws.aramex.net/track/{tn}",
      },
      settings: { createUrl: "https://ws.aramex.net/create" },
    });

    const result = await aramexAdapter.createShipment(provider, makeInput());
    expect(result.trackingNumber).toBe("ARX-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ws.aramex.net/create");
    const expected =
      "Basic " + Buffer.from("ops@altayebat.com:pw").toString("base64");
    expect(init.headers.authorization).toBe(expected);
  });
});

describe("stub adapter trackShipment (real carrier tracking)", () => {
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
    const provider = makeProvider({ credentials: {} });
    await expect(
      customAdapter.trackShipment(provider, "TRK-1"),
    ).rejects.toBeInstanceOf(DeliveryNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws DeliveryNotConfiguredError when configured but no track endpoint is wired", async () => {
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
      },
    });
    await expect(
      aramexAdapter.trackShipment(provider, "TRK-2"),
    ).rejects.toBeInstanceOf(DeliveryNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GETs the track endpoint with {tn} substituted and maps status + history", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "in_transit",
        statusAr: "قيد التوصيل",
        history: [
          { at: "2026-05-30T08:00:00Z", label: "Picked up" },
          {
            timestamp: "2026-05-30T10:00:00Z",
            description: "Out for delivery",
          },
        ],
      }),
    });
    const provider = makeProvider({ credentials: fullCustomCreds });

    const result = await customAdapter.trackShipment(provider, "AWB 123/45");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.carrier.com/track/AWB%20123%2F45");
    expect(init.method).toBe("GET");
    expect(init.headers.authorization).toBe("Bearer secret-token");
    expect(result.status).toBe("in_transit");
    expect(result.statusAr).toBe("قيد التوصيل");
    expect(result.history).toEqual([
      { at: "2026-05-30T08:00:00Z", label: "Picked up" },
      { at: "2026-05-30T10:00:00Z", label: "Out for delivery" },
    ]);
  });

  it("appends ?tn= when the track URL has no {tn} placeholder", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ state: "delivered" }),
    });
    const provider = makeProvider({
      credentials: {
        ...fullCustomCreds,
        trackUrl: "https://api.carrier.com/track?lang=ar",
      },
    });

    const result = await customAdapter.trackShipment(provider, "TRK-9");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.carrier.com/track?lang=ar&tn=TRK-9");
    expect(result.status).toBe("delivered");
    expect(result.history).toBeUndefined();
  });

  it("defaults status to 'unknown' when the carrier omits it", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const provider = makeProvider({ credentials: fullCustomCreds });

    const result = await customAdapter.trackShipment(provider, "TRK-7");
    expect(result.status).toBe("unknown");
    expect(result.statusAr).toBeNull();
  });

  it("throws when the carrier's tracking lookup fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "not found",
    });
    const provider = makeProvider({ credentials: fullCustomCreds });

    await expect(
      customAdapter.trackShipment(provider, "TRK-3"),
    ).rejects.toThrow(/HTTP 404/);
  });
});
