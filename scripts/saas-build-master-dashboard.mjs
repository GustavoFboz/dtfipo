#!/usr/bin/env node
/**
 * A SINGLE, privacy-minimized master dashboard snapshot. Its only completion
 * percentage is independently accepted beta release stages (not technical
 * effort). Read-only --check fails CI if a stage, formal item, P0 or legal
 * approval has changed since the previous build.
 *
 * --write creates the reviewed client-safe snapshot locally. Nothing in
 * this script touches provider/Cloud/Asaas or authorizes a sale/deployment.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve,join} from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=relative=>JSON.parse(readFileSync(join(root,relative),"utf8"));
const dest="src/data/saas-master-launch-panel.json";

const sectionTitles=Object.freeze({
 "1":"Eventos e recuperação de pagamentos",
 "2":"Ciclo financeiro e acesso",
 "3":"Arquivos e armazenamento",
 "4":"Segurança, identidade e clínicas",
 "5":"Planos, preços e cancelamentos",
 "6":"Operação, desempenho e LGPD",
 "7":"Produção e liberação comercial",
});
const criterionTitles=Object.freeze({
 "1.1":"Revisão dos eventos financeiros pendentes",
 "1.2":"Proteção contra pagamentos duplicados",
 "1.3":"Recuperação de webhook perdido",
 "2.1":"Renovação, atraso, cancelamento e retorno",
 "2.2":"Preservação de dados durante a cobrança",
 "2.3":"Offline e acesso em Windows e Android",
 "3.1":"Upload, download e exclusão protegidos",
 "3.2":"Concorrência, falhas e reservas de espaço",
 "3.3":"Arquivos reais em todos os aplicativos",
 "4.1":"Cadastro, senha e recuperação de conta",
 "4.2":"MFA, sessões e separação entre clínicas",
 "4.3":"Links privados e proteção de arquivos",
 "5.1":"Histórico e documentos de pagamento",
 "5.2":"Alteração de plano e cancelamento no Asaas",
 "5.3":"Troca futura de plano e limites de espaço",
 "6.1":"Processador financeiro e alertas",
 "6.2":"Backup completo, restauração e incidentes",
 "6.3":"Onboarding, velocidade e capacidade",
 "6.4":"Contratos, privacidade e aceite registrado",
 "7.1":"Conta Asaas aprovada",
 "7.2":"Webhook, segredos e rotina em produção",
 "7.3":"Primeiro pagamento real e liberação de acesso",
 "7.4":"Versão final, rollback e autorização de venda",
});
const gateTitles=Object.freeze({
  "72h-policy":"Regra de acesso offline por até 72 horas",
  "native-compilation":"Instaladores e emuladores de Windows/Android",
  "consistent-entitlement-guard":"Mesmo bloqueio de assinatura em todas as plataformas",
  "physical-device-expiry":"Expiração offline após 72 horas nos aparelhos reais",
  "physical-device-reauth":"Novo login e bloqueio/desbloqueio em aparelhos reais",
  "encrypted-operations-drill":"Ensaio de recuperação cifrada e falha simulada",
  "historical-real-db-offline-restore":"Banco histórico restaurado sem acesso externo",
  "historical-archive-physical-integrity":"Conferência criptográfica dos arquivos históricos",
  "storage-full-copy":"Cópia integral e autenticada do histórico congelado",
  "full-isolated-recovery":"Banco e arquivos completos restaurados juntos",
  "current-runtime-reconciliation":"Conferência da versão atual e plano real de incidente",
  "master-aal2-audit":"Operações administrativas protegidas por MFA",
  "workflow-tenant-presentation-boundary":"Isolamento do fluxo de trabalho por clínica",
  "unowned-patient-attribution":"Procedência dos registros históricos sem clínica",
  "cross-owner-local-cache-regressions":"Cache local não mistura contas e clínicas",
  "positive-control-readonly-qa-harness":"Consulta de teste com controle de acesso positivo",
  "two-company-rls-real-role-disposable":"Banco de teste bloqueia acessos entre clínicas",
  "revocation-and-cross-company-live-probes":"Revogar sessões e negar acessos cruzados no ambiente real",
  "positive-financial-replay":"Recuperar operação financeira autorizada sem duplicar valores",
  "renewal-real-provider":"Renovação real já observada no Sandbox",
  "cancellation-master-mfa":"Cancelamento no Asaas com MFA administrativo",
  "overdue-and-grace":"Atraso e período de tolerância comprovados",
  "refund-dispute-suspension":"Estorno/contestação e suspensão de acesso",
  "reactivation":"Reativação da assinatura após inadimplência",
  "renewal-invariants":"Histórico e período pago preservados na renovação",
  "cancellation-preservation":"Dados e período pago preservados no cancelamento",
  "arrears-refund-preservation":"Preservação dos arquivos durante atraso e estorno",
  "reactivation-preservation":"Conferir dados e período ao reativar o plano",
  "provider-future-schedule":"Troca de plano agendada no Asaas",
  "one-write-audit":"Uma operação autorizada por solicitação",
  "no-early-activation":"Troca futura não altera o plano antes do prazo",
  "future-activation-real":"Aplicação real da troca na próxima vigência",
  "downgrade-quota-enforcement":"Limite de espaço correto depois do downgrade",
  "ambiguous-failure-recovery":"Recuperar falha incerta sem repetir a cobrança",
  "bounded-local-pilot-harness":"Teste local de carga com limites seguros",
  "aggregate-db-readonly-baseline":"Leitura limitada da situação do banco atual",
  "staging-journal-and-fixtures":"Empresas e casos fictícios em banco isolado",
  "database-realtime-baseline":"Medir tempo de resposta e mensagens em staging",
  "native-onboarding-pilot":"Cadastro e arquivos em Windows/Android reais",
  "progressive-capacity-approval":"Aumentar carga com metas de desempenho e reversão",
  "legal-operational-protocol":"Planejamento de privacidade e responsabilidades",
  "internal-terms-privacy-dpa-drafts":"Minutas internas de Termos, Privacidade e DPA",
  "verified-supplier-retention-incident-register":"Inventário técnico de fornecedores e incidentes",
  "dormant-versioned-receipt-contract-verified":"Recibos de aceite por versão testados e desativados",
  "qualified-legal-business-review":"Revisão jurídica, comercial e de privacidade",
  "published-versioned-terms-acceptance":"Publicar termos aprovados e comprovar aceite",
  "shared-web-native-storage-app":"Arquivos incluídos nos aplicativos Web, Windows e Android",
  "private-file-and-quota-contract-in-ci":"Testes de arquivos privados e cotas de espaço",
  "storage-tenant-cache-and-auth-owner-scope":"Arquivos e cache limitados à clínica correta",
  "real-android-storage-journey":"Enviar, abrir e baixar anexos no Android real",
  "real-windows-storage-journey":"Enviar, abrir e baixar anexos no Windows real",
  "offline-expiry-storage-and-owner-physical":"Limpar cache após expiração e troca de conta",
  "manual-release-evidence-guard":"Bloqueio automático de liberação sem evidências",
  "master-release-readiness-disclosure":"Painel informa se vendas estão autorizadas",
  "source-locked-beta-preflight-reproducible":"Conferência de versão e integridade antes do release",
  "production-release-candidate-verified":"Versão final assinada e vinculada ao backend",
  "commercial-and-legal-approvals":"Preços e contratos aprovados para venda",
  "authorized-pilot-and-sales-release":"Primeira turma paga autorizada e monitorada",
});
const legalTitles=Object.freeze({
 L01:"Identificação e regularidade da prestadora",
 L02:"Responsável e canal de privacidade",
 L03:"Responsabilidades e bases legais de saúde",
 L04:"Contratos dos fornecedores e transferência de dados",
 L05:"Prazos de retenção e atendimento de direitos",
 L06:"Preços, cancelamento, reembolso e carência",
 L07:"Revisão jurídica dos documentos",
 L08:"Canal de suporte e resposta a incidentes",
 L09:"Convites e bloqueio de novas vendas",
 L10:"Telemetria e cookies sem dados clínicos",
 L11:"Aceite de documentos por versão",
 L12:"Telas de cadastro e reaceite dos termos",
 L13:"Operação de incidentes e direitos validada",
});
const p0Titles=Object.freeze({
 "production-billing-lifecycle":"Cobranças, renovação e cancelamento reais",
 "clinical-case-and-tenant-safety":"Casos e privacidade entre clínicas",
 "recoverable-backup-and-rollback":"Cópia recuperável e reversão",
 "approved-contract-and-versioned-consent":"Termos e DPA aprovados/aceitos",
 "deployment-source-and-environment-parity":"Versão correta no servidor",
 "privacy-safe-beta-observability":"Monitoramento sem dados de pacientes",
 "support-invitations-and-emergency-stop":"Suporte, convites e parada de novas vendas",
 "owner-authorized-paid-pilot":"Sua autorização final de lançamento",
});
const upcoming=Object.freeze({
 "5":"Confirmar segunda mensalidade, webhook e período pago no Asaas Sandbox.",
 "6":"Aprovar documentos, preços e suporte e testar aceites no sistema.",
 "7":"Testar login, arquivos e rollback em hospedagem de QA isolada.",
 "8":"Conferir oito requisitos, autorizar e publicar o beta por convite.",
});

const riskFlag=false;
function requireValid(ok,label){if(!ok)throw Error("MASTER_DASHBOARD_"+label);}
function enumStatus(value,all,label){requireValid(all.includes(value),label);return value;}
function aggregateSteps(step,legal,p0){
 if(step.status==="done")return [{id:"accepted-scope",title:"Aceite da etapa registrado (escopo delimitado)",status:"done"}];
 if(step.id===5){
  const evidence=step.checkpoint?.technical_disposable_finance_verified;
  return [
   {id:"synthetic-finance",title:"Ensaios locais de pagamentos, falhas e duplicidade",status:evidence?"prepared":"pending"},
   ...[
    "Segunda mensalidade no Asaas Sandbox",
    "Webhook, processamento único e período pago",
    "Atraso, suspensão, regularização e cancelamento",
    "Preço, plano e forma de pagamento no aplicativo",
    "Cancelamento e parada de novas vendas reais",
   ].map((title,i)=>({id:"provider-"+(i+1),title,status:"pending"}))
  ];
 }
 if(step.id===6){
  return [
   {id:"legal-drafts",title:"Minutas internas de Termos, Privacidade e DPA",status:step.checkpoint?.legal_lgpd_internal_drafts?"prepared":"pending"},
   {id:"security-review",title:"Proteções do servidor e recibos jurídicos em PR (não implantados)",status:"prepared"},
   ...legal.blocking_decisions.map(x=>({id:x.id,title:legalTitles[x.id],status:x.state==="verified"?"done":"pending"}))
  ];
 }
 if(step.id===7){
  return [
   {id:"local-rollback",title:"Ensaio de reversão A→B→A em servidor local descartável",status:step.checkpoint?.ephemeral_host_rollback?"prepared":"pending"},
   ...[
    "Hospedagem de testes, contas, banco e anexos separados",
    "Versão servida, login e casos funcionando no mesmo servidor",
    "Publicar e voltar à versão anterior no servidor de testes",
    "Integridade do backup, dos anexos e do código implantado",
   ].map((title,i)=>({id:"hosted-"+(i+1),title,status:"pending"}))
  ];
 }
 if(step.id===8){
  return [
   ...p0.checks.map(x=>({id:x.id,title:p0Titles[x.id],status:x.status==="verified"?"done":"pending"})),
   {id:"launch",title:"Publicar somente com autorização expressa, sem afetar clientes atuais",status:"pending"},
  ];
 }
 throw Error("MASTER_DASHBOARD_UNKNOWN_STAGE");
}

export function buildMasterDashboard({plan,implementation,technical,p0,legal}){
 requireValid(plan?.schema==="dentalflow-beta-eight-executions-v1"&&
   plan.steps?.length===8&&["not_published","published"].includes(plan.release_state),
   "BETA_SOURCE_INVALID");
 requireValid(implementation?.schema==="dentalflow-saas-implementation-evidence-v1"&&
   implementation.denominator===23&&technical?.sales_release_status==="blocked",
   "PROTOCOL_SOURCE_INVALID");
 requireValid(p0?.schema==="dentalflow-paid-beta-prelaunch-evidence-v1"&&p0.checks?.length===8&&
   legal?.schema==="dentalflow-beta6-legal-approval-register-v1"&&
   legal.blocking_decisions?.length===13,"APPROVAL_SOURCE_INVALID");
 const official=new Set(implementation.official_acceptance.accepted_ids);
 const remaining=new Set(implementation.remaining_ids);
 requireValid(official.size===implementation.official_acceptance.accepted_ids.length&&
   official.size+remaining.size===23,"FORMAL_COUNT_INVALID");
 const criteria=Object.keys(criterionTitles);
 requireValid(criteria.length===23&&criteria.every(id=>official.has(id)||remaining.has(id)),
   "FORMAL_IDS_INVALID");
 requireValid(p0.checks.every(x=>!!p0Titles[x.id]&&["pending","verified"].includes(x.status))&&
   new Set(p0.checks.map(x=>x.id)).size===8,"P0_IDS_INVALID");
 requireValid(legal.blocking_decisions.every(x=>!!legalTitles[x.id]&&
   ["pending","verified"].includes(x.state))&&
   new Set(legal.blocking_decisions.map(x=>x.id)).size===13,"LEGAL_IDS_INVALID");
 for(let i=0;i<8;i++){
   const step=plan.steps[i];
   requireValid(step.id===i+1 && ["done","pending","blocked"].includes(step.status),"STAGES_INVALID");
   if(step.status==="done") requireValid(step.evidence.length>0,"UNEVIDENCED_COMPLETE");
 }
 const done=plan.steps.filter(x=>x.status==="done").length;
 const p0Verified=p0.checks.filter(x=>x.status==="verified").length;
 const legalVerified=legal.blocking_decisions.filter(x=>x.state==="verified").length;
 if(plan.release_state==="published"){
  requireValid(done===8&&p0Verified===8&&plan.beta_approval_status==="approved",
    "UNAUTHORIZED_PUBLICATION");
 }
 const stages=plan.steps.map(x=>({
   id:x.id,
   title:x.name,
   status:x.status,
   brief:x.status==="done"?"Etapa concluída dentro do escopo registrado.":x.definition_of_done,
   substeps:aggregateSteps(x,legal,p0),
   next_action:x.status==="done"?null:upcoming[String(x.id)],
   requires_owner:x.status==="done"?false:[5,6,7,8].includes(x.id),
 }));
 const protocol_sections=Object.entries(sectionTitles).map(([group,title])=>({
  group: Number(group),title,
  items:criteria.filter(id=>id.startsWith(group+".")).map(id=>{
   const isDone=official.has(id);
   const gates=implementation.reviewed_partial_gates[id]??[];
   requireValid(isDone?gates.length===0:gates.length>0,"FORMAL_GATE_INVALID");
   requireValid(isDone || gates.every(g=>!!gateTitles[g.id]),"GATE_TRANSLATION_REQUIRED");
   return {
    id,title:criterionTitles[id],
    status:isDone?"done":gates.some(x=>x.complete)?"partial":"pending",
    completed_checks:isDone?1:gates.filter(x=>x.complete).length,
    total_checks:isDone?1:gates.length,
    substeps:isDone?[]:gates.map(g=>({
      id:g.id,
      title:gateTitles[g.id] ?? g.description,
      status:g.complete?"done":"pending"
    })),
   };
  })
 }));
 return {
   schema:"dentalflow-saas-unified-master-dashboard-v2",
   recorded_at:plan.recorded_at,
   primary:{
     percent:Number((done/8*100).toFixed(2)),
     completed:done,
     total:8,
     label:"Caminho comprovado até o beta",
     release_state:plan.release_state,
     approval_status:plan.beta_approval_status,
     sales_authorized:false,
   },
   other_controls:{
     technical_implementation:{completed:technical.completed_implementation_criteria,
       total:technical.total_items,recorded_at:technical.recorded_at,
       deferred_external_checks:technical.deferred_validation_gates},
     formal_accepted:{completed:official.size,total:23},
     p0:{completed:p0Verified,total:8},
     legal:{completed:legalVerified,total:13},
   },
   next_advances:stages.filter(x=>x.status!=="done").slice(0,3)
     .map(x=>({stage:x.id,title:x.title,action:x.next_action})),
   stages,protocol_sections,
   disclaimers:[
     "Único percentual representa etapas oficiais até beta; não é a porcentagem técnica histórica.",
     "Aceites formais e verificações externas não são convertidos automaticamente em etapas concluídas.",
     "Preparado em PR ou testado com dados fictícios não significa publicado.",
     "Este painel não habilita nem bloqueia tecnicamente o checkout; liberação comercial depende de decisão separada."
   ],
   source_files:[
     "docs/saas/BETA-RELEASE-8-EXECUTIONS.json",
     "docs/saas/IMPLEMENTATION-PROGRESS.json",
     "docs/saas/PAID-BETA-READINESS.json",
     "docs/saas/legal/BETA6-LEGAL-APPROVAL-REGISTER.json",
     "src/data/saas-protocol-progress.json",
   ],
 };
}

function fromRepo(){
 return buildMasterDashboard({
  plan:read("docs/saas/BETA-RELEASE-8-EXECUTIONS.json"),
  implementation:read("docs/saas/IMPLEMENTATION-PROGRESS.json"),
  technical:read("src/data/saas-protocol-progress.json"),
  p0:read("docs/saas/PAID-BETA-READINESS.json"),
  legal:read("docs/saas/legal/BETA6-LEGAL-APPROVAL-REGISTER.json"),
 });
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  const result=JSON.stringify(fromRepo(),null,2)+"\n";
  if(process.argv.includes("--write")){
   writeFileSync(join(root,dest),result,"utf8");
   console.log("MASTER_DASHBOARD_UPDATED_FROM_OFFICIAL_SOURCES");
  }else if(process.argv.includes("--check")){
   requireValid(readFileSync(join(root,dest),"utf8")===result,"SNAPSHOT_STALE_RUN_WRITE");
   console.log("MASTER_DASHBOARD_MATCHES_OFFICIAL_SOURCES");
  }else process.stdout.write(result);
 }catch(error){
  console.error(error instanceof Error?error.message:"MASTER_DASHBOARD_FAILED");
  process.exitCode=1;
 }
}
