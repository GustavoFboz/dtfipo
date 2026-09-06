// Desktop/Tauri build of the same DentalFlow application.
//
// The production web build remains untouched in vite.config.ts. Tauri embeds a
// static SPA shell and therefore does not need the Cloudflare/Nitro runtime.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  nitro: false,
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
    // this build reusable by future native shells such as Capacitor.
    base: "./",
    resolve: {
      alias: [
        {
          // Desktop patient/case/reference reads are progressively local-first,
          // while every non-migrated function still comes from the shared API.
          find: /^@\/lib\/api$/,
          replacement: fileURLToPath(new URL("./src/lib/api.desktop.ts", import.meta.url)),
        },
        {
          // Clinic context, agenda and clinical records use SQLite/outbox on Desktop.
          find: /^@\/lib\/clinic$/,
          replacement: fileURLToPath(new URL("./src/lib/clinic.desktop.ts", import.meta.url)),
        },
        {
          // Legacy stock screens receive the same local-first treatment without
          // changing their imports or the production Web implementation.
          find: /^@\/lib\/stock$/,
          replacement: fileURLToPath(new URL("./src/lib/stock.desktop.ts", import.meta.url)),
        },
      ],
    },
    server: {
      host: "127.0.0.1",
      port: 1420,
      strictPort: true,
    },
    build: {
      target: "chrome105",
    },
  },
});
