import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const read=(p)=>readFileSync(p,'utf8');
const d=JSON.parse(read('docs/saas/legal/SUPPLIERS-RETENTION-INCIDENT-REGISTER.json'));
test('supplier entries must match source integrations and never invent a signed DPA or region',()=>{
 assert.equal(d.schema,'dentalflow-privacy-governance-source-register-v1');
 assert.equal(d.status,'INTERNAL_UNAPPROVED');
 assert.equal(d.legal_approval,false);
 assert.equal(d.subprocessor_contracts_verified,false);
 assert.equal(d.customer_publication_allowed,false);
 const suppliers=new Map(d.suppliers.map(s=>[s.id,s]));
 assert.deepEqual([...suppliers.keys()].sort(),['asaas','lovable','supabase']);
 for(const s of suppliers.values()){
   assert.equal(s.integration_verified,true);
   assert.equal(s.contract_verified,false);
   assert.equal(s.processing_region_verified,false);
   assert.equal(s.international_transfer_assessment,'PENDING');
   assert.match(s.observed_in,/^(src|docs)\//);
   assert.ok(read(s.observed_in).length>0);
 }
 assert.match(read(suppliers.get('supabase').observed_in),/createClient<Database>/);
 assert.match(read(suppliers.get('asaas').observed_in),/receiveAsaasWebhook/);
 assert.match(read(suppliers.get('lovable').observed_in),/Lovable/);
});
test('retention facts are exact source constants, not fabricated erasure promises',()=>{
 const m=new Map(d.retention.map(x=>[x.id,x]));
 assert.equal(m.get('offline-device-access').value,72);
 assert.match(read(m.get('offline-device-access').source),/MAX_OFFLINE_ACCESS_MS\s*=\s*3\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
 assert.equal(m.get('private-signed-file-url').value,300);
 assert.match(read(m.get('private-signed-file-url').source),/PRIVATE_FILE_URL_TTL_SECONDS\s*=\s*300/);
 for(const id of ['clinical-patient-data','payment-ledger','cloud-backups']){
   assert.equal(m.get(id).status,'NOT_APPROVED');
   assert.equal(m.get(id).value,null);
 }
 assert.equal(m.get('security-incident-record').status,'REGULATORY_BASELINE_NOT_IMPLEMENTATION');
 assert.equal(m.get('security-incident-record').value,5);
});
test('incident record template is complete but not a notification or incident response test',()=>{
 const v=d.incidents;
 assert.equal(v.contains_real_incidents,false);
 assert.equal(v.external_notification_automatic,false);
 assert.equal(v.legal_review_required,true);
 assert.equal(v.preserve_minimum_years,5);
 assert.deepEqual(v.minimum_fields,[
  'detected_at','incident_description','affected_data_categories',
  'affected_people_estimate','risk_assessment','containment_and_mitigation',
  'notified_anpd_or_people','decision_rationale','incident_owner','legal_review'
 ]);
 assert.match(v.anpd_reference,/^https:\/\/www\.gov\.br\/anpd\//);
 assert.match(v.external_deadline,/3 business days/);
});
