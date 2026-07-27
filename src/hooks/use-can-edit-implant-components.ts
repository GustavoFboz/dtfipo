import { useQuery } from "@tanstack/react-query";
import { fetchStageAssignees, fetchWorkflowStages } from "@/lib/workflow";
import { fetchProfile } from "@/lib/api";
import { parseRequirements } from "@/lib/stage-requirements";
import type { CaseRow } from "@/lib/types";

/**
 * Permite editar (selecionar/alterar/remover) componentes de implante por dente
 * SOMENTE quando:
 *  - o caso está numa etapa marcada como `requires_implant_components`; e
 *  - o usuário atual é responsável por essa etapa (ou admin, ou etapa sem responsáveis).
 *
 * Ao avançar de etapa, `requires` vira false e a UI fica somente-leitura.
 * Se alguém retornar o caso para a etapa de componentes, volta a ser editável.
 */
export function useCanEditImplantComponents(caseRow: CaseRow) {
  const stageId = (caseRow as any).current_stage_id as string | null;

  const stagesQ = useQuery({ queryKey: ["workflow_stages"], queryFn: fetchWorkflowStages });
  const profileQ = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const assigneesQ = useQuery({
    queryKey: ["stage_assignees", stageId],
    queryFn: () => fetchStageAssignees(stageId as string),
    enabled: !!stageId,
  });

  const stage = (stagesQ.data ?? []).find((s) => s.id === stageId) ?? null;
  const requirements = parseRequirements((stage as any)?.requirements);
  const requires = requirements.some((r) => r.type === "implant_components") || !!stage?.requires_implant_components;

  const role = profileQ.data?.role;
  const isAdmin = role === "CEO" || role === "DR";
  const uid = profileQ.data?.id;
  const assignees = assigneesQ.data ?? [];
  const hasAssignees = assignees.length > 0;
  const isResponsible = !!uid && assignees.some((a) => a.user_id === uid);

  const canEdit = requires && (isAdmin || !hasAssignees || isResponsible);
  return { canEdit, requires, isAdmin, isResponsible, hasAssignees, stage };
}
