import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Founder: run an AI consultancy",
    short_name: "Founder",
    description: "Start and run an AI consultancy in a realistic simulated market.",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F5F7",
    theme_color: "#14213D",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
