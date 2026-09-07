import { supabase as desktopSupabase } from "./client.desktop";

export * from "./client.desktop";

/**
 * Desktop 0.3.0 channel safety layer.
 *
 * Supabase Realtime does not allow adding postgres_changes callbacks to a channel
 * that is already subscribed. Radix dialog remounts can overlap cleanup by a few
 * milliseconds; using an identical topic during that overlap made Supabase return
 * the already-subscribed channel and throw before the dialog could render.
 *
 * Each Desktop channel call therefore receives a unique transport topic. Logical
 * routing still happens through table/filter options and RLS, not through the topic
 * name, so this does not change authorization or event semantics.
 */
export const supabase = new Proxy(desktopSupabase as any, {
  get(target, prop, receiver) {
    if (prop === "channel") {
      return (topic: string, ...args: unknown[]) => {
        const uniqueTopic = `${String(topic)}:desktop030:${crypto.randomUUID()}`;
        return (target.channel as any)(uniqueTopic, ...args);
      };
    }
    return Reflect.get(target, prop, receiver);
  },
}) as typeof desktopSupabase;
