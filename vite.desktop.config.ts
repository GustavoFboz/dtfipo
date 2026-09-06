// Desktop/Tauri build of the same DentalFlow application.
//
// The production web build remains untouched in vite.config.ts. Tauri needs a
// static SPA shell because the executable embeds the frontend and does not run
// the Cloudflare/Nitro server locally. TanStack Start still keeps the same route
// tree and client-side application code.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    spa: {
      enabled: true,
      prerender: {
        outputPath: "/index.html",
      },
    },
  },
  vite: {
    // Relative assets are important for the Tauri asset protocol and also make
    // the generated shell portable if we later reuse it in Capacitor.
    base: "./",
    server: {
      host: "127.0.0.1",
      port: 1420,
      strictPort: true,
    },
    // WebView2 on supported Windows versions comfortably handles this target.
    build: {
      target: "chrome105",
    },
  },
});
