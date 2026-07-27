import { useQuery } from "@tanstack/react-query";
import type { CaseRow } from "@/lib/types";
import { fetchCases } from "@/lib/api";
import { NewCaseDialog } from "./NewCaseDialog";

type Props = {
  caseRow: CaseRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditCaseDialog({ caseRow, open, onOpenChange }: Props) {
  // Sempre reflete a versão mais recente do caso (mesma fonte usada pelo
  // "Detalhes do caso"), evitando abrir o editor com um snapshot obsoleto.
  const casesQ = useQuery({
    queryKey: ["cases", "active"],
    queryFn: () => fetchCases("active"),
    enabled: open && !!caseRow,
    staleTime: 60_000,
  });

  if (!caseRow) return null;

  const liveRow =
    (casesQ.data ?? []).find((c) => c.id === caseRow.id) ?? caseRow;

  return (
    <NewCaseDialog
      editCase={liveRow}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
