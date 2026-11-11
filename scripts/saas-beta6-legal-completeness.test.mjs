import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {test} from "node:test";

const read = name => readFileSync(name,"utf8");
const root = "docs/saas/legal/";
const control=JSON.parse(read(root+"BETA6-LEGAL-APPROVAL-REGISTER.json"));
const steps=JSON.parse(read("docs/saas/BETA-RELEASE-8-EXECUTIONS.json"));
const readiness=JSON.parse(read("docs/saas/PAID-BETA-READINESS.json"));

test("legal phase6 documentation is comprehensive but does NOT silently authorize a paid beta",()=>{
  assert.equal(control.schema,"dentalflow-beta6-legal-approval-register-v1");
  assert.equal(control.status,"INTERNAL_DRAFT_NOT_FOR_USERS");
  for(const field of [
    "legal_review_approved","privacy_review_approved","technical_deployment_approved",
    "commercial_approved","publication_authorized","document_versions_published",
    "external_billing_authorized","customer_acceptances_issued",
    "live_prices_approved","actual_supplier_contracts_verified","transfers_assessed",
    "retention_policy_approved","clinical_data_legal_bases_reviewed",
    "beta_invite_gate_server_enforced","new_sales_emergency_stop_tested"
  ]) assert.equal(control[field],false,"No real approval: "+field);
  for(const field of [
    "effective_legal_entity","privacy_contact","incident_contact",
    "approved_support_channel","appointed_dpo_or_documented_exemption"
  ]) assert.equal(control[field],null,"Never forge identity/contact: "+field);
  assert.equal(control.no_automatic_completion_of_stage6,true);
  assert(control.blocking_decisions.length>=12);
  assert(control.blocking_decisions.every(x=>x.state==="pending"&&x.evidence===null));
  assert.equal(steps.steps.find(x=>x.id===6)?.status,"pending");
  assert.equal(steps.steps.filter(x=>x.status==="done").length,4);
  assert.equal(steps.release_state,"not_published");
  assert.equal(readiness.production_changes_authorized,false);
  assert.equal(readiness.checks.filter(x=>x.status==="verified").length,0);
});

test("no legal draft is approved or published without a legal representative and versioned acceptance",()=>{
  const wanted=["saas_terms","privacy_notice","dpa","pilot_annex","cookie_notice"];
  assert.deepEqual(control.documents.map(x=>x.id),wanted);
  for(const doc of control.documents){
    assert.equal(doc.approved,false);assert.equal(doc.published,false);
    assert.match(doc.version,/^draft-v/);
    const text=read(doc.file);
    assert(text.length>1600,"Substantial artifact: "+doc.id);
    assert.match(text,/NÃO (?:APROVAD|PUBLICAD|ASSINAD)|NÃO VIGENTE/i);
    assert.match(text,/PENDENTE/);
    assert.doesNotMatch(text,/\b(?:sb_secret_|sk_live_|whsec_)[A-Za-z0-9]{15,}\b/);
  }
  const client=read("src/lib/saas-legal-acceptance.ts");
  const sql=read("docs/saas/sql/saas-legal-versioned-acceptance-schema.sql");
  assert.match(client,/VITE_SAAS_LEGAL_ACCEPTANCE_ENABLED\s*===\s*"true"/);
  assert.match(sql,/trg_saas_legal_receipts_immutable/);
  assert.match(sql,/c\.owner_id=v_actor/);
  assert.match(sql,/body_sha256=p_expected_sha256/);
});

test("health information never relies on generic SaaS contract consent or a marketing license",()=>{
  for(const name of ["SAAS-TERMS-DRAFT.md","PRIVACY-NOTICE-DRAFT.md","DPA-DRAFT.md"]){
    const s=read(root+name);
    assert.match(s,/art\.\s*11/i);
    assert.match(s,/controlador/i);
    assert.match(s,/operador/i);
    assert.match(s,/consentimento/i);
    assert.match(s,/dados clínicos/i);
    assert.match(s,/incidente/i);
    assert.match(s,/PENDENTE/);
  }
  assert.match(read(root+"SAAS-TERMS-DRAFT.md"),/responsabilidade/i);
  assert.match(read(root+"DPA-DRAFT.md"),/suboperadores/i);
  assert.match(read(root+"PRIVACY-NOTICE-DRAFT.md"),/crianças/i);
});

test("operational controls, decision matrix and high-risk inventory are present and unapproved",()=>{
  const docs=[
    "LGPD-OPERATIONS-RUNBOOK.md","ROPA-PRELIMINARY.md","RIPD-PRELIMINARY.md",
    "BETA-PILOT-COMMERCIAL-ANNEX-DRAFT.md","COOKIES-AND-TELEMETRY-DRAFT.md",
    "REVIEW-GATES.md"
  ].map(f=>read(root+f));
  for(const s of docs)assert(s.length>1700);
  assert.match(docs[0],/três dias úteis/i);
  assert.match(docs[0],/cinco anos/i);
  assert.match(docs[0],/20 anos/i);
  assert.match(docs[1],/R05/);
  assert.match(docs[2],/P12/);
  assert.match(docs[3],/gate.*servidor|bloqueio.*servidor/i);
  assert.match(docs[3],/novos checkouts/i);
  assert.match(docs[4],/cookies/i);
  assert.match(docs[5],/NÃO PUBLICAR COMO TERMOS VIGENTES/i);
  const landing=read("src/routes/lp.tsx");
  assert.match(landing,/Criar minha empresa/); // explicitly a P0 for invite-only beta
  assert.match(docs[3],/Criar minha empresa/);
});

test("all real approvers and subprocessor transfer information remain explicit dependencies",()=>{
  const supplier=JSON.parse(read(root+"SUPPLIERS-RETENTION-INCIDENT-REGISTER.json"));
  assert.equal(supplier.customer_publication_allowed,false);
  assert.equal(supplier.legal_approval,false);
  assert.equal(supplier.subprocessor_contracts_verified,false);
  assert(supplier.suppliers.every(s=>s.contract_verified===false
    && s.processing_region_verified===false));
  assert(control.blocking_decisions.some(x=>/transferências/.test(x.subject)));
  assert(control.blocking_decisions.some(x=>/jurídico|advogado/.test(x.subject)));
  assert(control.blocking_decisions.some(x=>/Convite|Convite|Convite|convite/.test(x.subject)));
});

test("sole-person CPF provider is documented with minimal, secure collection and no implicit publication",()=>{
  assert.equal(control.provider_legal_form_preference,"individual_cpf_no_cnpj_initial");
  assert.deepEqual(control.provider_identity_collection_policy.initial_request,
    ["legal_name","municipality_and_state","controlled_service_and_privacy_email"]);
  assert(control.provider_identity_collection_policy.never_in_git_or_chat.includes("cpf_number"));
  assert.equal(control.effective_legal_entity,null);
  assert.equal(control.customer_acceptances_issued,false);
  assert.equal(control.publication_authorized,false);
  for(const file of ["SAAS-TERMS-DRAFT.md","PRIVACY-NOTICE-DRAFT.md","DPA-DRAFT.md"]){
    const text=read(root+file);
    assert.match(text,/pessoa física/i);
    assert.match(text,/CPF/);
    assert.match(text,/PENDENTE/);
    assert.doesNotMatch(text,/\b[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}\b/);
  }
  const checklist=read(root+"DADOS-PENDENTES-PARA-APROVACAO.md");
  assert.match(checklist,/apenas três informações/);
  assert.match(checklist,/Não é necessário informar CPF neste chat/i);
  assert.match(checklist,/Decreto 7\.962\/2013/);
  assert.match(checklist,/NFS-e/);
  assert.equal(steps.steps.find(x=>x.id===6).status,"pending");
  assert.equal(steps.steps.filter(x=>x.status==="done").length,4);
});


test("public GitHub must never receive real sole-person identity or unapproved personal contact",()=>{
  const state=control.provider_identity_collection_policy;
  assert.equal(state.private_values_initially_supplied_outside_public_repository,true);
  assert.equal(state.private_values_verified,false);
  assert.equal(state.public_disclosure_authorized,false);
  assert.equal(state.public_support_contact_verified,false);
  const docs=[
    "SAAS-TERMS-DRAFT.md","PRIVACY-NOTICE-DRAFT.md","DPA-DRAFT.md",
    "BETA-PILOT-COMMERCIAL-ANNEX-DRAFT.md","DADOS-PENDENTES-PARA-APROVACAO.md"
  ];
  for(const file of docs){
    const source=read(root+file);
    // Until publication is authorized, any personal mailbox in a PUBLIC
    // contract draft is a privacy breach, not a completed legal field.
    assert.doesNotMatch(source,/\b[\w.+-]+@(?:gmail|outlook|hotmail|yahoo)\.[a-z]{2,}\b/i,
      "Unapproved personal email in public legal source: "+file);
    assert.doesNotMatch(source,/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
      "CPF must never appear in public docs: "+file);
  }
  const policy=read(root+"PF-DATA-PUBLICATION-SAFETY.md");
  assert.match(policy,/visibilidade \*\*pública\*\*/);
  assert.match(policy,/não foram verificadas/i);
  assert.match(policy,/histórico público/);
  assert.equal(steps.steps.find(x=>x.id===6).status,"pending");
  assert.equal(steps.release_state,"not_published");
});
