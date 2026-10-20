import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Superdarts",
    short_name: "Superdarts",
    description: "Scoring, practice and stats for our darts nights.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0c1713",
    theme_color: "#0c1713",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
