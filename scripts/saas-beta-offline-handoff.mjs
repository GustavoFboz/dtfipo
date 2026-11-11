#!/usr/bin/env node
/**
 * Read-only, privacy-safe beta handoff for periods without hosted access.
 * No network, secrets, production writes, provider calls or approvals.
 *
 * This is a checkpoint / work-planning aid, never a release gate that can
 * approve production. Evidence URLs are metadata, NOT independent proof.
 */
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {assessBetaExecutionPlan} from "./saas-beta-eight-executions.mjs";
import {assessPaidBetaPilot} from "./saas-paid-beta-pilot-gate.mjs";

export const HANDOFF_WORKSTREAMS=Object.freeze([
  {id:5, title:"Asaas e acesso",
   offline_possible:"Revisar casos de erro, testes de pagamentos fictícios, idempotência e proteção contra cobrança duplicada.",
   dependency:"Asaas Sandbox real, webhook recebido e processado, banco de QA, planos e valores aprovados.",
   user_action:"Confirmar preços e autorizar ensaio financeiro Sandbox quando o ambiente estiver isolado."},
  {id:6, title:"LGPD, termos e convites",
   offline_possible:"Revisar minutas, recibos por versão, limitação de convites, suporte e interrupção de novas compras.",
   dependency:"Revisão jurídica/privacidade e testes de aceite no sistema hospedado.",
   user_action:"Aprovar condições comerciais e canal de suporte; validar identificação fiscal com profissionais adequados."},
  {id:7, title:"Hospedagem e reversão",
   offline_possible:"Conferir SHA do código, testes de compilação e reversão Web isolada A→B→A; preparar roteiro de implantação.",
   dependency:"Hospedagem de QA real com autenticação, banco e arquivos separados; rollback real e verificado.",
   user_action:"Disponibilizar ambiente isolado quando o provedor permitir, sem compartilhar senhas no chat."},
  {id:8, title:"Beta comercial por convite",
   offline_possible:"Preparar lista de verificações P0, instruções de suporte e plano de resposta a incidentes.",
   dependency:"Oito P0 verificados, etapas 1-7 aceitas, plano/valor público correto e autorização final expressa.",
   user_action:"Revisar o pacote de evidências e autorizar explicitamente a primeira turma paga."},
]);

const checkUrl=url=>{
  if(typeof url!=="string") return false;
  let u;
  try{u=new URL(url);}catch{return false;}
  return u.protocol==="https:" && !!u.hostname &&
    !(/(^|\.)(example\.(invalid|org|com|net)|localhost|test|invalid)$/.test(u.hostname) ||
      /^(127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) &&
    !u.username && !u.password && !u.hash && !u.search;
};

function assertLegalReview(document){
  if(!document ||
     document.schema!=="dentalflow-beta6-legal-approval-register-v1" ||
     !Array.isArray(document.blocking_decisions) ||
     document.blocking_decisions.length!==13 ||
     document.publication_authorized!==false ||
     document.external_billing_authorized!==false ||
     document.customer_acceptances_issued!==false)
      throw Error("BETA_HANDOFF_LEGAL_SCHEMA_OR_AUTHORITY_INVALID");
  const seen=new Set();
  for(const decision of document.blocking_decisions){
    if(!decision || !/^L(0[1-9]|1[0-3])$/.test(decision.id) ||
      seen.has(decision.id) ||
      !["pending","verified"].includes(decision.state) ||
      typeof decision.subject!=="string" || !decision.subject.trim())
      throw Error("BETA_HANDOFF_LEGAL_DECISIONS_INVALID");
    seen.add(decision.id);
  }
  if(Array.from({length:13},(_,i)=>"L"+String(i+1).padStart(2,"0"))
      .some(id=>!seen.has(id)))throw Error("BETA_HANDOFF_LEGAL_DECISIONS_INVALID");
  return document.blocking_decisions.filter(x=>x.state!=="verified").map(x=>x.id);
}

/** Reject placeholder links when somebody tries to upgrade a P0/stage to verified. */
function assertNoPlaceholderEvidence(plan,readiness){
  for(const step of plan.steps){
    if(step.status==="done" && step.evidence.some(link=>!checkUrl(link)))
      throw Error("BETA_HANDOFF_STEP_EVIDENCE_PLACEHOLDER");
  }
  for(const check of readiness.checks){
    if(check.status==="verified" && check.evidence.some(link=>!checkUrl(link)))
      throw Error("BETA_HANDOFF_P0_EVIDENCE_PLACEHOLDER");
  }
}

export function assessOfflineBetaHandoff({plan,readiness,legal}){
  const stage=assessBetaExecutionPlan(plan,readiness);
  const paid=assessPaidBetaPilot(readiness);
  const legalPending=assertLegalReview(legal);
  assertNoPlaceholderEvidence(plan,readiness);

  if(stage.release_state!=="not_published" ||
    stage.completed>7 ||
    paid.status==="eligible_for_manual_review" ||
    paid.release_authorized!==false ||
    paid.commercial_payments_authorized!==false)
      throw Error("BETA_HANDOFF_UNEXPECTED_RELEASE_AUTHORITY");

  const stream=HANDOFF_WORKSTREAMS.map(x=>{
    const item=plan.steps.find(z=>z.id===x.id);
    if(!item)throw Error("BETA_HANDOFF_STAGE_MISSING");
    return {
      id:x.id,
      title:x.title,
      status:item.status,
      offline_possible:x.offline_possible,
      external_dependency:x.dependency,
      owner_later:x.user_action,
      evidence_links_recorded:item.evidence.length,
      evidence_independently_verified:false,
    };
  });
  return {
    schema:"dentalflow-beta-offline-handoff-v1",
    generated_from:"versioned_public_repo_control_files",
    progress:stage.completed_label,
    percent:stage.percent,
    release_state:stage.release_state,
    status:"blocked_pending_independent_evidence",
    stages:stream,
    outstanding_p0:paid.incomplete,
    outstanding_p0_count:paid.incomplete.length,
    unresolved_legal_decision_ids:legalPending,
    next_required_intervention:"Only after a safe QA host and an approved Sandbox workflow are available; no secrets via chat.",
    code_and_synthetic_tests_are_not_provider_or_hosted_approvals:true,
    evidence_links_are_not_verified_by_this_script:true,
    no_production_changes:true,
    no_payment_operations:true,
    release_authorized:false,
    commercial_payments_authorized:false,
    note:"May advance steps out of sequence when independently evidenced. Never mark hosted, real renewal, legal approval or pilot launch based on synthetic tests.",
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const root="docs/saas/";
    const plan=JSON.parse(readFileSync(root+"BETA-RELEASE-8-EXECUTIONS.json","utf8"));
    const readiness=JSON.parse(readFileSync(root+"PAID-BETA-READINESS.json","utf8"));
    const legal=JSON.parse(readFileSync(root+"legal/BETA6-LEGAL-APPROVAL-REGISTER.json","utf8"));
    const report=assessOfflineBetaHandoff({plan,readiness,legal});
    process.stdout.write(JSON.stringify(report,null,2)+"\n");
  }catch{
    console.error("BETA_OFFLINE_HANDOFF_BLOCKED");
    process.exitCode=1;
  }
}
