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
          // Desktop gets Cloud Login/offline identity plus a 0.3.0 channel layer
          // that guarantees a fresh Realtime topic per mounted subscriber.
          find: /^@\/integrations\/supabase\/client$/,
          replacement: fileURLToPath(new URL("./src/integrations/supabase/client.desktop.030.ts", import.meta.url)),
        },
        {
          find: /^@\/lib\/api$/,
          replacement: fileURLToPath(new URL("./src/lib/api.desktop.case-offline.ts", import.meta.url)),
        },
        {
          // Some legacy routes import patients-local-first directly instead of
          // going through @/lib/api. Keep those native reads cache-first too.
          find: /^@\/lib\/patients-local-first$/,
          replacement: fileURLToPath(new URL("./src/lib/patients.desktop.ts", import.meta.url)),
        },
        {
          find: /^@\/lib\/clinic$/,
          replacement: fileURLToPath(new URL("./src/lib/clinic.desktop.ts", import.meta.url)),
        },
        {
          // Billing/session entitlement is part of the Desktop authorization
          // snapshot. A fresh install verifies it once; later boots can render a
          // still-valid paid snapshot immediately from SQLite.
          find: /^@\/lib\/subscriptions$/,
          replacement: fileURLToPath(new URL("./src/lib/subscriptions.desktop.ts", import.meta.url)),
        },
        {
          find: /^@\/lib\/workflow$/,
          replacement: fileURLToPath(new URL("./src/lib/workflow.desktop.ts", import.meta.url)),
        },
        {
          find: /^@\/lib\/stock$/,
          replacement: fileURLToPath(new URL("./src/lib/stock.desktop.ts", import.meta.url)),
        },
        {
          // `/estoque` currently uses stock-v2, so it needs its own exact alias.
          find: /^@\/lib\/stock-v2$/,
          replacement: fileURLToPath(new URL("./src/lib/stock-v2.desktop.ts", import.meta.url)),
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