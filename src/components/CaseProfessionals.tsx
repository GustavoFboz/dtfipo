import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchTeamMembersLocalFirst } from "@/lib/team-local-first";
import { Popover, PopoverContent, PopoverTrigger, PopoverArrow } from "@/components/ui/popover";
import type { CaseRow } from "@/lib/types";

type LiteProfile = { id: string; full_name: string | null; avatar_url: string | null; role: string | null; account_subtype?: string | null };

type ActivityParticipantRow = {
  user_id: string | null;
  mentions: string[] | null;
};

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const isCadistaProfile = (profile: LiteProfile | null | undefined) =>
  norm(profile?.account_subtype || profile?.role) === "cadista";

/** One resilient profile lookup shared by every visible case row. */
function useProfilesLite() {
  return useQuery({
    queryKey: ["profiles-lite"],
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const cachedTeam = await fetchTeamMembersLocalFirst().catch(() => []);
      const merged = new Map<string, LiteProfile>();
      for (const item of cachedTeam) merged.set(item.id, item as LiteProfile);

      // The backend is the authoritative privacy boundary. This secondary merge
      // only enriches identities already visible through RLS and never makes an
      // historical CAD designer eligible for a case (see useProfessionals).
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, role, account_subtype");
        if (error) throw error;
        for (const item of data ?? []) merged.set((item as any).id, item as unknown as LiteProfile);
      } catch (error) {
        console.warn("[DentalFlow] Perfis complementares do caso indisponíveis", error);
      }
      return Array.from(merged.values());
    },
  });
}

function useCaseActivityParticipants(caseId: string) {
  return useQuery({
    queryKey: ["case-professional-activity", caseId],
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("case_activity" as never)
          .select("user_id,mentions")
          .eq("case_id", caseId)
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return (data ?? []) as unknown as ActivityParticipantRow[];
      } catch (error) {
        console.warn(`[DentalFlow] Participantes de atividade indisponíveis para ${caseId}`, error);
        return [] as ActivityParticipantRow[];
      }
    },
  });
}

const roleLabel = (profile: LiteProfile | null | undefined, fallback = "Colaborador") => {
  const role = norm(profile?.account_subtype || profile?.role);
  if (["dr", "dentista"].includes(role)) return "Dentista";
  if (role === "cadista") return "Cadista";
  if (role === "protetico") return "Protético";
  if (role === "solicitante") return "Solicitante";
  if (role === "atendimento") return "Atendimento";
  if (["ceo", "admin", "administrador"].includes(role)) return "Administrador";
  return fallback;
};

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

/**
 * A CAD designer is intentionally special: only the currently assigned CAD
 * designer may appear. Authors/mentions from an earlier assignment must never
 * resurrect another CAD designer in the UI or expose that person's existence.
 */
function useProfessionals(c: CaseRow): Professional[] {
  const profiles = useProfilesLite();
  const activities = useCaseActivityParticipants(c.id);

  return useMemo(() => {
    const list = profiles.data ?? [];
    const byId = new Map(list.map((p) => [p.id, p]));
    const byName = new Map(list.filter((p) => p.full_name).map((p) => [norm(p.full_name), p]));
    const out: Professional[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    const doctor = (c as any).doctor;
    const cadista = (c as any).cadista;
    const doctorProfile = doctor?.user_id ? byId.get(doctor.user_id) : byName.get(norm(doctor?.name));
    const cadistaProfile = cadista?.user_id ? byId.get(cadista.user_id) : byName.get(norm(cadista?.name));
    const currentCadistaId = String(cadista?.user_id ?? cadistaProfile?.id ?? "");
    const currentCadistaName = norm(cadista?.name ?? cadistaProfile?.full_name);

    const isCurrentCadista = (profile: LiteProfile | null | undefined, fallbackName?: string | null) => {
      if (!isCadistaProfile(profile)) return false;
      if (currentCadistaId && profile?.id === currentCadistaId) return true;
      return Boolean(currentCadistaName && norm(profile?.full_name ?? fallbackName) === currentCadistaName);
    };

    const push = (profile: LiteProfile | null | undefined, fallbackName: string | null | undefined, fallbackRole: string) => {
      // Critical privacy guard. Even when an old CAD designer is present in
      // historical activity or a stale local team cache, the row is discarded.
      if (isCadistaProfile(profile) && !isCurrentCadista(profile, fallbackName)) return;

      const label = (profile?.full_name ?? fallbackName ?? "").trim();
      if (!label) return;
      if (profile?.id && seenIds.has(profile.id)) return;
      const normalizedName = norm(label);
      if (!profile?.id && seenNames.has(normalizedName)) return;
      if (profile?.id) seenIds.add(profile.id);
      seenNames.add(normalizedName);
      out.push({
        key: profile?.id ?? `${fallbackRole}:${normalizedName}`,
        name: label,
        role: roleLabel(profile, fallbackRole),
        avatar: profile?.avatar_url ?? null,
      });
    };

    if (doctor?.name || doctorProfile) push(doctorProfile, doctor?.name, "Dentista");
    if (cadista?.name || cadistaProfile) push(cadistaProfile, cadista?.name, "Cadista");

    const requestedBy = String((c as any).requested_by ?? "");
    const acceptedBy = String((c as any).accepted_by ?? "");
    if (requestedBy) push(byId.get(requestedBy), null, "Solicitante");
    if (acceptedBy) push(byId.get(acceptedBy), null, "Responsável");

    const activityIds: string[] = [];
    for (const row of activities.data ?? []) {
      if (row.user_id) activityIds.push(String(row.user_id));
      for (const mentioned of Array.isArray(row.mentions) ? row.mentions : []) {
        if (mentioned) activityIds.push(String(mentioned));
      }
    }
    for (const id of activityIds) push(byId.get(id), null, "Mencionado");

    return out;
  }, [profiles.data, activities.data, c]);
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
        <div className="mb-6 px-4 text-[12px] font-bold uppercase tracking-[0.25em] text-[#9EA4AE] dark:text-slate-500">Profissionais</div>
        <div className="space-y-6">
          {people.map((p) => (
            <div key={p.key} className="flex items-center gap-4 px-2">
              <div className="shrink-0"><Avatar p={p} size={42} /></div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium text-slate-700 dark:text-slate-200">{p.name}</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#AAB2C0] dark:text-slate-500">{p.role}</div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default CaseProfessionals;