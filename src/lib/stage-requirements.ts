import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchWorkflowStages, fetchStageAssignees } from "@/lib/workflow";
import { fetchProfile } from "@/lib/api";
import { fetchCaseImplantTeeth } from "@/lib/implants";
import type { CaseRow } from "@/lib/types";

export type StageRequirementType =
  | "implant_components"
  | "download_scans"
  | "upload_models"
  | "upload_fabrication"
  | "upload_html"
  | "upload_gallery";

export type StageRequirement = {
  type: StageRequirementType;
  blocks_advance: boolean;
};

export type TabKey =
  | "detalhes"
  | "galeria"
  | "html"
  | "scans"
  | "modelos"
  | "confeccao"
  | "comentarios";

export const REQUIREMENT_CATALOG: Record<
  StageRequirementType,
  { label: string; description: string; targetTab: TabKey }
> = {
  implant_components: {
    label: "Apontar componente para dentes com implantes",
    description: "Cadastrar o sistema/componente usado em cada dente com implante.",
    targetTab: "detalhes",
  },
  download_scans: {
    label: 'Baixar arquivos da aba "Escaneamentos"',
    description: "O responsável deve baixar os escaneamentos para trabalhar no CAD.",
    targetTab: "scans",
  },
  upload_models: {
    label: 'Enviar arquivo na aba "Modelos"',
    description: "Pelo menos um arquivo precisa ser enviado em Modelos.",
    targetTab: "modelos",
  },
  upload_fabrication: {
    label: 'Enviar arquivo na aba "Elementos"',
    description: "Pelo menos um arquivo precisa ser enviado em Elementos.",
    targetTab: "confeccao",
  },
  upload_html: {
    label: 'Enviar arquivo na aba "Html"',
    description: "Enviar o HTML do exocad.",
    targetTab: "html",
  },
  upload_gallery: {
    label: 'Enviar imagem na aba "Galeria"',
    description: "Adicionar pelo menos uma imagem na galeria.",
    targetTab: "galeria",
  },
};

// Abas sempre acessíveis, independente das exigências
export const ALWAYS_OPEN_TABS: TabKey[] = ["detalhes", "scans", "comentarios"];

export function parseRequirements(raw: unknown): StageRequirement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const type = (item as any).type as StageRequirementType | undefined;
      if (!type || !(type in REQUIREMENT_CATALOG)) return null;
      return { type, blocks_advance: !!(item as any).blocks_advance };
    })
    .filter(Boolean) as StageRequirement[];
}

async function countAttachments(caseId: string, kind: string): Promise<number> {
  const { count } = await supabase
    .from("case_attachments" as never)
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId)
    .eq("kind", kind)
    .is("expired_at", null);
  return count ?? 0;
}

async function countScanDownloads(caseId: string): Promise<number> {
  const { count } = await supabase
    .from("case_activity" as never)
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId)
    .eq("kind", "download")
    .eq("metadata->>kind", "scans");
  return count ?? 0;
}

export type RequirementStatus = StageRequirement & {
  fulfilled: boolean;
};

/**
 * Hook: retorna estado das exigências para o caso.
 * - `requirements`: lista bruta configurada na etapa
 * - `status`: cada requisito com flag `fulfilled`
 * - `pending`: requisitos ainda não cumpridos
 * - `blockingPending`: requisitos pendentes que impedem avanço
 * - `allowedTabs`: abas que o usuário responsável pode acessar
 * - `canAdvance`: se pode ir para próxima etapa
 * - `isResponsible`, `isAdmin`, `applies`: metadados
 */
export function useStageRequirements(caseRow: CaseRow | null | undefined) {
  const stageId = caseRow ? ((caseRow as any).current_stage_id as string | null) : null;

  const stagesQ = useQuery({ queryKey: ["workflow_stages"], queryFn: fetchWorkflowStages });
  const profileQ = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const assigneesQ = useQuery({
    queryKey: ["stage_assignees", stageId],
    queryFn: () => fetchStageAssignees(stageId as string),
    enabled: !!stageId,
  });

  const stage = (stagesQ.data ?? []).find((s) => s.id === stageId) ?? null;
  const requirements = parseRequirements((stage as any)?.requirements);

  const role = profileQ.data?.role;
  const isAdmin = role === "CEO" || role === "DR";
  const uid = profileQ.data?.id;
  const assignees = assigneesQ.data ?? [];
  const hasAssignees = assignees.length > 0;
  const isResponsible = !!uid && assignees.some((a) => a.user_id === uid);

  // Necessário buscar dados para checar cumprimento
  const needsImplant = requirements.some((r) => r.type === "implant_components");
  const implantTeethQ = useQuery({
    queryKey: ["case_implant_teeth", caseRow?.id ?? "__none__"],
    queryFn: () => {
      if (!caseRow) return Promise.resolve([]);
      return fetchCaseImplantTeeth(caseRow.id);
    },
    enabled: !!caseRow && needsImplant && (caseRow.implant_teeth?.length ?? 0) > 0,
  });

  const needsScanDownload = requirements.some((r) => r.type === "download_scans");
  const scanDownloadsQ = useQuery({
    queryKey: ["case_scan_downloads", caseRow?.id ?? "__none__"],
    queryFn: () => {
      if (!caseRow) return Promise.resolve(0);
      return countScanDownloads(caseRow.id);
    },
    enabled: !!caseRow && needsScanDownload,
  });

  const kindByType: Record<StageRequirementType, string | null> = {
    implant_components: null,
    download_scans: null,
    upload_models: "model",
    upload_fabrication: "fabrication",
    upload_html: "exocad_html",
    upload_gallery: "gallery",
  };

  const attachmentKinds = requirements
    .map((r) => kindByType[r.type])
    .filter(Boolean) as string[];

  const attachmentsQ = useQuery({
    queryKey: ["case_attachment_counts", caseRow?.id ?? "__none__", attachmentKinds.sort().join(",")],
    queryFn: async () => {
      if (!caseRow) return {} as Record<string, number>;
      const entries = await Promise.all(
        attachmentKinds.map(async (k) => [k, await countAttachments(caseRow.id, k)] as const),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
    enabled: !!caseRow && attachmentKinds.length > 0,
  });

  function isFulfilled(req: StageRequirement): boolean {
    if (!caseRow) return true;
    switch (req.type) {
      case "implant_components": {
        const teeth = caseRow.implant_teeth ?? [];
        // Se o caso não tem nenhum dente marcado com sistema de implante,
        // não há o que apontar — exigência considerada cumprida.
        if (teeth.length === 0) return true;
        const usages = implantTeethQ.data ?? [];
        return teeth.every((t) => usages.some((u) => u.tooth_fdi === t));
      }
      case "download_scans":
        return (scanDownloadsQ.data ?? 0) > 0;
      case "upload_models":
      case "upload_fabrication":
      case "upload_html":
      case "upload_gallery": {
        const k = kindByType[req.type]!;
        return (attachmentsQ.data?.[k] ?? 0) > 0;
      }
    }
  }

  const status: RequirementStatus[] = requirements.map((r) => ({
    ...r,
    fulfilled: isFulfilled(r),
  }));

  const pending = status.filter((r) => !r.fulfilled);
  const blockingPending = pending.filter((r) => r.blocks_advance);

  // Somente o responsável pela etapa (ou admin, ou etapa sem responsáveis)
  // é cobrado pelas exigências. Para os demais usuários nada é exigido nem
  // bloqueado — e eles também não podem executar a ação exigida.
  const isStageOwner = isAdmin || !hasAssignees || isResponsible;
  const applies = requirements.length > 0 && isStageOwner;


  // Abas liberadas quando exigências pendentes existem
  const pendingTargetTabs = pending.map((r) => REQUIREMENT_CATALOG[r.type].targetTab);
  const allowedTabs: TabKey[] = applies && pending.length > 0
    ? Array.from(new Set([...ALWAYS_OPEN_TABS, ...pendingTargetTabs]))
    : (["detalhes", "galeria", "html", "scans", "modelos", "confeccao", "comentarios"] as TabKey[]);

  function tabBlockedMessage(tab: TabKey): string | null {
    if (!applies || allowedTabs.includes(tab)) return null;
    const list = pending
      .map((r) => `• ${REQUIREMENT_CATALOG[r.type].label}`)
      .join("\n");
    return `Cumpra as exigências da etapa "${stage?.name ?? ""}" para acessar esta aba:\n\n${list}`;
  }

  function advanceBlockedMessage(): string | null {
    if (!applies || blockingPending.length === 0) return null;
    const list = blockingPending
      .map((r) => `• ${REQUIREMENT_CATALOG[r.type].label}`)
      .join("\n");
    return `Para avançar da etapa "${stage?.name ?? ""}" você precisa:\n\n${list}`;
  }

  return {
    stage,
    requirements,
    status,
    pending,
    blockingPending,
    allowedTabs,
    applies,
    isAdmin,
    isResponsible,
    hasAssignees,
    canAdvance: !applies || blockingPending.length === 0,
    isLoading:
      stagesQ.isLoading ||
      profileQ.isLoading ||
      assigneesQ.isLoading ||
      implantTeethQ.isLoading ||
      attachmentsQ.isLoading ||
      scanDownloadsQ.isLoading,
    tabBlockedMessage,
    advanceBlockedMessage,
    isStageOwner,
    canEditImplantComponents:
      requirements.some((r) => r.type === "implant_components") && isStageOwner,
    hasImplantRequirement:
      requirements.some((r) => r.type === "implant_components") && isStageOwner,

  };
}