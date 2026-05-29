import { Router } from "express";
import { db } from "@workspace/db";
import { bannersTable } from "@workspace/db";

const router = Router();

router.get("/banners", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(bannersTable)
      .orderBy(bannersTable.sortOrder);
    res.json(
      rows.map((b) => ({
        id: b.id,
        title: b.title,
        titleAr: b.titleAr,
        subtitle: b.subtitle ?? null,
        subtitleAr: b.subtitleAr ?? null,
        imageUrl: b.imageUrl,
        linkType: b.linkType ?? null,
        linkId: b.linkId ?? null,
        badgeText: b.badgeText ?? null,
        badgeTextAr: b.badgeTextAr ?? null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list banners");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
