import app from "./app";
import { logger } from "./lib/logger";
import { ensureCategoriesSeeded } from "./lib/seed-categories";
import { ensureDemoProductsSeeded } from "./lib/seed-demo-products";
import { backfillAuthMethod } from "./lib/backfill-auth-method";
import { backfillVendorProfiles } from "./lib/backfill-vendor-profiles";
import { startOrderExpiryScheduler } from "./lib/order-expiry";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Demo products must seed AFTER categories exist (looked up by slug).
  void ensureCategoriesSeeded().then(() => ensureDemoProductsSeeded());
  void backfillAuthMethod();
  void backfillVendorProfiles();

  startOrderExpiryScheduler();
});
