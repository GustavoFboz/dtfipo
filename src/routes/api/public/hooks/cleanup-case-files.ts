import { createFileRoute } from "@tanstack/react-router";

// Hourly cron hits this endpoint. It deletes physical files from the
// "case-files" storage bucket whose case_attachments row is past its
// expires_at, then marks the row's expired_at so it stops being returned.
// The row itself is preserved for historical audit.
export const Route = createFileRoute("/api/public/hooks/cleanup-case-files")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require a shared secret to prevent unauthenticated callers from
        // triggering service-role storage deletions.
        const secret = process.env.CRON_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        if (!secret || auth !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: rows, error } = await supabaseAdmin
          .from("case_attachments")
          .select("id, storage_path")
          .is("expired_at", null)
          .lte("expires_at", new Date().toISOString())
          .limit(500);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!rows || rows.length === 0) {
          return new Response(JSON.stringify({ ok: true, removed: 0 }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const paths = rows.map((r) => r.storage_path);
        const { error: stErr } = await supabaseAdmin.storage.from("case-files").remove(paths);
        if (stErr) {
          return new Response(
            JSON.stringify({ ok: false, error: stErr.message, attempted: paths.length }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const now = new Date().toISOString();
        await supabaseAdmin
          .from("case_attachments")
          .update({ expired_at: now })
          .in("id", rows.map((r) => r.id));

        return new Response(
          JSON.stringify({ ok: true, removed: rows.length }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
      GET: async () =>
        new Response("Unauthorized", { status: 401 }),
    },
  },
});
