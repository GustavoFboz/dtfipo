import { readFileSync, writeFileSync } from 'node:fs';
import { releaseDecision } from './saas-sales-release-gate.mjs';
import { summarizeBetaImplementation } from './saas-beta-implementation-progress.mjs';

const ledger=JSON.parse(readFileSync('docs/saas/IMPLEMENTATION-PROGRESS.json','utf8'));
const decision=releaseDecision(ledger);
const scope=JSON.parse(readFileSync('docs/saas/BETA-IMPLEMENTATION-SCOPE.json','utf8'));
const implementation=summarizeBetaImplementation(ledger,scope);
const data={
  schema:'dentalflow-saas-dashboard-progress-v1',
  recorded_at:ledger.recorded_at,
  overall_progress_percent:implementation.overall_progress_percent,
  progress_scope:'beta_implementation',
  completed_implementation_criteria:implementation.completed_implementation_criteria,
  remaining_implementation_ids:implementation.remaining_implementation_ids,
  deferred_validation_gates:implementation.deferred_external_validation_gates,
  accepted_items:result.accepted_items,
  total_items:result.total_items,
  remaining_items:result.remaining_items,
  pending_ids:[...ledger.remaining_ids],
  reviewed_partial_items:result.reviewed_partial_items.length,
  sales_release_status:decision.status,
  note:'Indicador único de IMPLEMENTAÇÃO pronta para beta: gates de engenharia demonstrados por evidências. Ensaios físicos, eventos futuros e aprovação externa ficam fora deste percentual e mantêm bloqueios de lançamento específicos. Mudança de escopo não equivale a trabalho recém-concluído.',
};
const output=JSON.stringify(data,null,2)+'\n';
const path='src/data/saas-protocol-progress.json';
if(process.argv.includes('--check')){
  const current=readFileSync(path,'utf8');
  if(current!==output){console.error('SAAS_DASHBOARD_PROGRESS_OUT_OF_SYNC');process.exitCode=1;}
  else console.log('SAAS_DASHBOARD_PROGRESS_IN_SYNC');
}else{
  writeFileSync(path,output);
  console.log('SAAS_DASHBOARD_PROGRESS_GENERATED');
}
