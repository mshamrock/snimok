import type { Metadata } from "next";

/** Canonical public origin; every other host redirects here (see src/proxy.ts). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://snimok.xyz").replace(/\/$/, "");
export const SITE_HOST = new URL(SITE_URL).host;

export const SITE_NAME = "Snimok";
export const SITE_TAGLINE = "Free screenshot tool for Mac with instant links";
export const SITE_DESCRIPTION =
  "Snimok is a free screenshot and GIF recorder for macOS: select an area, and a shareable link opens instantly. Annotate, tag and find every capture by the text on it. A Gyazo alternative that imports your Gyazo library.";

/** Shared Open Graph image (public/og.png, 1200×630). Capture pages use their own image. */
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Snimok — Screenshot. Link. Done." };


/**
 * Metadata for an indexable public page: canonical URL plus a complete Open
 * Graph / Twitter block (a page-level `openGraph` replaces the layout's, so it
 * has to be whole).
 */
export function pageMetadata(o: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  const fullTitle = o.absoluteTitle ? o.title : `${o.title} · ${SITE_NAME}`;
  return {
    title: o.absoluteTitle ? { absolute: o.title } : o.title,
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url: o.path,
      title: fullTitle,
      description: o.description,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description: o.description, images: [OG_IMAGE.url] },
  };
}

/** The desktop app as schema.org sees it; reused by the home and download pages. */
export function softwareApplicationLd() {
  return {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#app`,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: `${SITE_URL}/`,
    downloadUrl: `${SITE_URL}/Snimok.zip`,
    image: `${SITE_URL}${OG_IMAGE.url}`,
    operatingSystem: "macOS 13 or later",
    applicationCategory: "MultimediaApplication",
    applicationSubCategory: "Screenshot tool",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Area and window screenshots with an instant shareable link",
      "GIF screen recording",
      "Annotation editor: arrows, shapes, text, blur, crop, resize",
      "Search captures by the text on the image (OCR)",
      "Tags, descriptions, app and web page metadata",
      "Private captures visible only to you",
      "Import of an existing Gyazo library with original dates",
    ],
    publisher: { "@id": `${SITE_URL}/#org` },
  };
}

export function organizationLd() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#org`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/icon-512.png`,
    sameAs: ["https://github.com/mshamrock/snimok"],
  };
}
