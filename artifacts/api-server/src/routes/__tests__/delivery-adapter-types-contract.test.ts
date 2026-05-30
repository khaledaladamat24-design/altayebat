import { describe, it, expect, vi } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

// Drive exactly what listAdapterTypes() returns so we can assert the
// `/delivery/adapter-types` response is validated/serialized against the OpenAPI
// `AdapterType` array contract before it reaches the admin UI. Only the registry
// function the route touches is mocked; everything else falls through.
const { adapterTypes } = vi.hoisted(() => ({
  adapterTypes: { value: [] as unknown[] },
}));

vi.mock("../../delivery/registry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../delivery/registry")>();
  return {
    ...actual,
    listAdapterTypes: () => adapterTypes.value,
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

describe("GET /api/delivery/adapter-types — response contract validation", () => {
  it("returns well-formed adapter types on contract", async () => {
    adapterTypes.value = [
      {
        type: "manual",
        requiredCredentials: [
          { key: "apiKey", label: "مفتاح الـ API", placeholder: "..." },
        ],
      },
      { type: "aramex", requiredCredentials: [] },
    ];
    const res = await request(app).get("/api/delivery/adapter-types");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({
      type: "manual",
      requiredCredentials: [
        { key: "apiKey", label: "مفتاح الـ API", placeholder: "..." },
      ],
    });
  });

  it("strips unknown/off-contract fields from each entry", async () => {
    adapterTypes.value = [
      {
        type: "custom",
        requiredCredentials: [{ key: "token", label: "رمز" }],
        secretInternalField: "should-not-leak",
      },
    ];
    const res = await request(app).get("/api/delivery/adapter-types");

    expect(res.status).toBe(200);
    expect(res.body[0]).not.toHaveProperty("secretInternalField");
    expect(JSON.stringify(res.body)).not.toContain("should-not-leak");
  });

  it("surfaces a malformed adapter-type entry as a controlled 500", async () => {
    logError.mockClear();
    // A drift: a renamed credential field (`name` instead of `label`) and a
    // missing `type` — both contract violations.
    adapterTypes.value = [
      { requiredCredentials: [{ key: "apiKey", name: "renamed field" }] },
    ];
    const res = await request(app).get("/api/delivery/adapter-types");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(logError).toHaveBeenCalled();
  });
});
