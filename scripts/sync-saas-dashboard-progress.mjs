import { readFileSync, writeFileSync } from 'node:fs';
import { summarizeImplementationProgress } from './saas-implementation-progress.mjs';

const ledger=JSON.parse(readFileSync('docs/saas/IMPLEMENTATION-PROGRESS.json','utf8'));
const result=summarizeImplementationProgress(ledger);
const data={
  schema:'dentalflow-saas-dashboard-progress-v1',
  recorded_at:ledger.recorded_at,
  overall_progress_percent:result.overall_progress_percent,
  accepted_items:result.accepted_items,
  total_items:result.total_items,
  remaining_items:result.remaining_items,
  pending_ids:[...ledger.remaining_ids],
  reviewed_partial_items:result.reviewed_partial_items.length,
  note:'Indicador único do Protocolo SaaS: aceites integrais e marcos parciais comprovados; 100% depende dos 23 aceites. Dados correspondem à versão publicada.',
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
