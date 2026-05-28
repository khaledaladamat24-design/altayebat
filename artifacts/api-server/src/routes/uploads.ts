import { Router } from "express";
import { createHash } from "node:crypto";

const router = Router();

/**
 * Returns a short-lived signature the browser can use to upload directly to
 * Cloudinary without ever seeing the API secret. We sign a fixed folder plus a
 * server-issued timestamp so callers can't tamper with the destination.
 */
router.post("/uploads/cloudinary-signature", (req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(500).json({ error: "Cloudinary is not configured on the server." });
  }

  const folder = typeof req.body?.folder === "string" && req.body.folder
    ? String(req.body.folder)
    : "altayebat_menu_images";
  // Cloudinary uses seconds, not ms.
  const timestamp = Math.floor(Date.now() / 1000);

  // Cloudinary signature spec: SHA1(sorted "key=value&..." of all signed params + api_secret).
  // We sign only `folder` and `timestamp`; everything else (file, api_key) is sent
  // separately by the browser and not part of the signed payload.
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(toSign + apiSecret).digest("hex");

  res.json({
    cloudName,
    apiKey,
    folder,
    timestamp,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
  });
});

export default router;
