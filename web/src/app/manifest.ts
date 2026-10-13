import type { MetadataRoute } from "next";

/** Web app manifest: home-screen / install icon and colours (Darkroom tokens). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Snimok",
    short_name: "Snimok",
    description: "Instant screenshots with a shareable link.",
    start_url: "/captures",
    display: "standalone",
    background_color: "#0f0e0c",
    theme_color: "#0f0e0c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
