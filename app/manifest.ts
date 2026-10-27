import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UCENO — Your world, connected",
    short_name: "UCENO",
    description: "Conversations, communities and the people who matter.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1018",
    theme_color: "#10131d",
    icons: [
      { src: "/icons/uceno.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/uceno.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ]
  };
}
