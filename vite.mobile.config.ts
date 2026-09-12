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
    base: "./",
    resolve: {
      alias: [
        {
          // Android uses the same validated Cloud Login + device identity contract
          // as Desktop, backed by IndexedDB instead of SQLite.
          find: /^@\/integrations\/supabase\/client$/,
          replacement: fileURLToPath(new URL("./src/integrations/supabase/client.desktop.030.ts", import.meta.url)),
        },
        {
          find: /^@\/lib\/api$/,
          replacement: fileURLToPath(new URL("./src/lib/api.desktop.case-offline.ts", import.meta.url)),
        },
        {
          find: /^@\/lib\/patients-local-first$/,
          replacement: fileURLToPath(new URL("./src/lib/patients.desktop.ts", import.meta.url)),
        },
        {
          find: /^@\/lib\/clinic$/,
          replacement: fileURLToPath(new URL("./src/lib/clinic.desktop.ts", import.meta.url)),
        },
        {
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
          find: /^@\/lib\/stock-v2$/,
          replacement: fileURLToPath(new URL("./src/lib/stock-v2.desktop.ts", import.meta.url)),
        },
      ],
    },
    build: {
      target: "chrome105",
    },
  },
});
