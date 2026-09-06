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
          // Desktop gets a Supabase facade that can resolve the previously
          // validated local device identity while Windows is fully offline.
          find: /^@\/integrations\/supabase\/client$/,
          replacement: fileURLToPath(new URL("./src/integrations/supabase/client.desktop.ts", import.meta.url)),
        },
        {
          find: /^@\/lib\/api$/,
          replacement: fileURLToPath(new URL("./src/lib/api.desktop.ts", import.meta.url)),
        },
        {
          find: /^@\/lib\/clinic$/,
          replacement: fileURLToPath(new URL("./src/lib/clinic.desktop.ts", import.meta.url)),
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
