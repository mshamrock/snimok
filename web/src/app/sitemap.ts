import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Only the public, indexable pages. Captures are private-by-link and noindex. */
export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-10-14");
  return [
    { url: `${SITE_URL}/`, lastModified: updated, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/download`, lastModified: updated, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/gyazo-alternative`, lastModified: updated, changeFrequency: "monthly", priority: 0.8 },
  ];
}
