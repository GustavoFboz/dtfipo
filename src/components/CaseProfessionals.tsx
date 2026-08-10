import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger, PopoverArrow } from "@/components/ui/popover";
import type { CaseRow } from "@/lib/types";

type LiteProfile = { id: string; full_name: string | null; avatar_url: string | null; role: string | null };

/** One cached, lightweight profile lookup shared by every row. */
function useProfilesLite() {
  return useQuery({
    queryKey: ["profiles-lite"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role");
      if (error) return [] as LiteProfile[];
      return (data ?? []) as unknown as LiteProfile[];
    },
  });
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export type Professional = {
  key: string;
  name: string;
  role: string;
  avatar: string | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

/** Order matters: leftmost = most important (dentista, cadista, then protéticos). */
function useProfessionals(c: CaseRow): Professional[] {
  const profiles = useProfilesLite();
  return useMemo(() => {
    const list = profiles.data ?? [];
    const byId = new Map(list.map((p) => [p.id, p]));
    const byName = new Map(list.map((p) => [norm(p.full_name), p]));

    const out: Professional[] = [];
    const seen = new Set<string>();
    const push = (name: string | null | undefined, role: string, profile?: LiteProfile | null) => {
      const label = (name ?? profile?.full_name ?? "").trim();
      if (!label) return;
      const key = `${role}:${norm(label)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ key, name: label, role, avatar: profile?.avatar_url ?? null });
    };

    if (c.doctor?.name) push(c.doctor.name, "Dentista", byName.get(norm(c.doctor.name)));
    if (c.cadista?.name) {
      const p = (c.cadista.user_id ? byId.get(c.cadista.user_id) : null) ?? byName.get(norm(c.cadista.name));
      push(c.cadista.name, "Cadista", p);
    }
    // Protéticos cadastrados (sempre exibidos após dentista/cadista)
    for (const p of list) {
      if (norm(p.role) === "protetico") push(p.full_name, "Protético", p);
    }
    return out;
  }, [profiles.data, c.doctor?.name, c.cadista?.name, c.cadista?.user_id]);
}

function Avatar({ p, size = 34 }: { p: Professional; size?: number }) {
  return (
    <span
      className="grid place-items-center overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-500"
      style={{ width: size, height: size }}
    >
      {p.avatar ? (
        <img
          src={p.avatar}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        initials(p.name)
      )}
    </span>
  );
}

export function CaseProfessionals({ caseRow }: { caseRow: CaseRow }) {
  const people = useProfessionals(caseRow);
  // Removed local state, Popover manages its own state or can be controlled if needed

  if (people.length === 0) {
    return <div className="text-[15px] font-light text-slate-400">—</div>;
  }

  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center transition-transform hover:-translate-y-[1px]"
          aria-label="Ver profissionais do caso"
        >
          {shown.map((p, i) => (
            <span
              key={p.key}
              className="rounded-full ring-2 ring-white dark:ring-slate-950"
              style={{ marginLeft: i === 0 ? 0 : -10, zIndex: shown.length - i }}
            >
              <Avatar p={p} />
            </span>
          ))}
          {extra > 0 && (
            <span
              className="grid h-[34px] w-[34px] place-items-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground ring-2 ring-white dark:ring-slate-950"
              style={{ marginLeft: -10 }}
            >
              +{extra}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={12}
        className="w-[300px] rounded-[2.5rem] border-0 bg-[#F8F9FB] dark:bg-slate-900 p-7 shadow-[25px_25px_50px_#d1d9e6,-25px_-25px_50px_#ffffff] dark:shadow-[25px_25px_50px_#0a0f1a,-10px_-10px_40px_#1e293b]"
        onClick={(e) => e.stopPropagation()}
      >
        <PopoverArrow className="fill-[#F8F9FB] dark:fill-slate-900" width={20} height={10} />
        
        <div className="mb-6 px-4 text-[12px] font-bold uppercase tracking-[0.25em] text-[#9EA4AE] dark:text-slate-500">
          Profissionais
        </div>

        <div className="space-y-6">
          {people.map((p) => (
            <div
              key={p.key}
              className="flex items-center gap-4 px-2"
            >
              <div className="shrink-0">
                <Avatar p={p} size={42} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium text-slate-700 dark:text-slate-200">
                  {p.name}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#AAB2C0] dark:text-slate-500">
                  {p.role}
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default CaseProfessionals;
