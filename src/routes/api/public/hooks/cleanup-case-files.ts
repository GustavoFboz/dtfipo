import { createFileRoute } from "@tanstack/react-router";

// Retention by time was retired in favor of the clinic storage manager.
// Keep this authenticated endpoint as a harmless no-op so an existing cron can
// continue calling it without deleting files or generating repeated failures.
export const Route = createFileRoute("/api/public/hooks/cleanup-case-files")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        if (!secret || auth !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        return new Response(
          JSON.stringify({
            ok: true,
            disabled: true,
            removed: 0,
            reason: "File retention is managed by clinic storage quota.",
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
      GET: async () => new Response("Unauthorized", { status: 401 }),
    },
  },
});
