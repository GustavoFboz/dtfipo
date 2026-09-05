import { readFileSync, writeFileSync } from "node:fs";

const file = "src/components/CasesTable.tsx";
let source = readFileSync(file, "utf8");

const typeImport = 'import type { CaseRow } from "@/lib/types";';
const workflowImport = 'import { fetchWorkflowStagesV2, getCaseWorkflowStages } from "@/lib/workflow-v2";';
if (!source.includes(workflowImport)) {
  if (!source.includes(typeImport)) throw new Error("CasesTable type import anchor not found");
  source = source.replace(typeImport, `${typeImport}\n${workflowImport}`);
}

const queryAnchor = '  const stages = useQuery({ queryKey: ["stages"], queryFn: fetchStages });';
const scopedQuery = `${queryAnchor}\n  const workflowStages = useQuery({\n    queryKey: ["workflow_stages_v2"],\n    queryFn: fetchWorkflowStagesV2,\n    staleTime: 15_000,\n  });\n\n  const stagesForCase = (caseRow: CaseRow) =>\n    getCaseWorkflowStages(workflowStages.data ?? [], caseRow as any, {\n      requiresSintering: Boolean(\n        ((caseRow as any).teeth_zirconia ?? []).length ||\n        (caseRow as any).zirconia_stock_item_id ||\n        (caseRow as any).dissilicato_stock_item_id,\n      ),\n    });`;

if (!source.includes('const workflowStages = useQuery({')) {
  if (!source.includes(queryAnchor)) throw new Error("CasesTable stages query anchor not found");
  source = source.replace(queryAnchor, scopedQuery);
}

const needle = '{stages.data?.map((s) => (';
const replacement = '{stagesForCase(c).map((s) => (';
const positions = [];
let cursor = 0;
while (true) {
  const index = source.indexOf(needle, cursor);
  if (index < 0) break;
  positions.push(index);
  cursor = index + needle.length;
}

// Expected occurrences: compact row picker, toolbar filter, standard row picker.
if (positions.length !== 3) {
  throw new Error(`Expected 3 raw stage mappings, found ${positions.length}`);
}

// Replace only the two per-case pickers. The middle occurrence is the toolbar filter.
for (const index of [positions[2], positions[0]]) {
  source = source.slice(0, index) + replacement + source.slice(index + needle.length);
}

writeFileSync(file, source);
console.log("CasesTable stage picker now scopes options to the case workflow/version.");
