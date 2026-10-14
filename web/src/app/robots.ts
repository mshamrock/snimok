import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Public marketing pages are crawlable; the signed-in app and APIs are not.
 * Capture pages (/i/…) stay crawlable on purpose: they carry `noindex`, which
 * crawlers can only see if they may fetch the page, and link-preview bots need
 * them for the image card.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/settings",
          "/captures",
          "/tags",
          "/apps",
          "/sites",
          "/recap",
          "/claim",
          "/connect",
          "/r/",
          "/uploads/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
