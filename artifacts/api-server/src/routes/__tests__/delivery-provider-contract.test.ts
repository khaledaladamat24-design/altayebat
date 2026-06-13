import { describe, it, expect, vi } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { getAdminPassword } from "../../lib/admin-auth";

// Drive exactly what the provider routes read from the DB so we can assert the
// response is validated/serialized against the OpenAPI `DeliveryProvider`
// contract before it reaches the admin UI. Only the methods the provider routes
// touch are mocked; everything else falls through to the real module.
const { selectRows } = vi.hoisted(() => ({
  selectRows: { value: [] as unknown[] },
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      select: () => ({
        from: async () => selectRows.value,
      }),
    },
  };
});

import deliveryRouter from "../delivery";

const logError = vi.fn();

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { log: unknown }).log = {
      error: logError,
      info() {},
      warn() {},
    };
    next();
  });
  app.use("/api", deliveryRouter);
  return app;
}

const app = makeApp();

/** A well-formed delivery_providers row as returned by drizzle (dates as Date). */
function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code: "aramex",
    name: "Aramex",
    nameAr: "أرامكس",
    type: "manual",
    baseUrl: null,
    enabled: true,
    isDefault: true,
    contactPhone: null,
    contactWhatsapp: null,
    credentials: { apiKey: "super-secret-token" },
    settings: {},
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("GET /api/delivery/providers — response contract validation", () => {
  it("never leaks raw credentials and exposes hasCredentials", async () => {
    selectRows.value = [validRow()];
    const res = await request(app)
      .get("/api/delivery/providers")
      .set("x-admin-key", getAdminPassword());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);

    const row = res.body[0];
    expect(row).not.toHaveProperty("credentials");
    expect(row.hasCredentials).toBe(true);
    // The serialized payload must not contain the secret anywhere.
    expect(JSON.stringify(res.body)).not.toContain("super-secret-token");
    // Dates are serialized to ISO strings per the contract.
    expect(row.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("reports hasCredentials=false when none are configured", async () => {
    selectRows.value = [validRow({ credentials: {} })];
    const res = await request(app)
      .get("/api/delivery/providers")
      .set("x-admin-key", getAdminPassword());

    expect(res.status).toBe(200);
    expect(res.body[0].hasCredentials).toBe(false);
  });

  it("surfaces a malformed row as a controlled 500 instead of off-contract data", async () => {
    logError.mockClear();
    // A row missing the required `code`/`name` (contract violation). Even though
    // sanitize() runs, the resulting payload fails Zod validation.
    selectRows.value = [
      validRow({ code: undefined, name: undefined, nameAr: undefined }),
    ];
    const res = await request(app)
      .get("/api/delivery/providers")
      .set("x-admin-key", getAdminPassword());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(logError).toHaveBeenCalled();
  });
});
