/**
 * Beta 4/8: real Supabase Auth and PostgREST smoke with two disposable tenants.
 * Runs EXCLUSIVELY against Supabase CLI loopback origin in a disposable GH runner.
 * No Lovable, no Asaas, no cloud host or clinical files/secrets.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reject = (code) => { throw Error(code); };
const requireUUID = (v) => { if (!UUID.test(v ?? "")) reject("QA_LOCAL_ID_INVALID"); return v; };

export function verifyLoopback(origin, allow = process.env.DENTALFLOW_BETA4_LOCAL_TEST === "true") {
  if (!allow) reject("QA_LOCAL_EXPLICIT_OPT_IN_REQUIRED");
  let url;
  try { url = new URL(origin); } catch { reject("QA_LOCAL_ORIGIN_REJECTED"); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== "54321"
      || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    reject("QA_LOCAL_ORIGIN_REJECTED");
  }
  return url.origin;
}

export function parseLocalStatus(value) {
  const variables = {};
  for (const line of value.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) variables[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return {
    url: variables.API_URL,
    anonKey: variables.ANON_KEY || variables.PUBLISHABLE_KEY,
    adminKey: variables.SERVICE_ROLE_KEY,
  };
}

const safeStatus = (response) => String(response?.status ?? "network");
async function endpoint(origin, path, method, key, jwt, body, options = {}) {
  const headers = { "apikey": key, "Authorization": "Bearer " + jwt,
    "Cache-Control": "no-store", "Accept": "application/json",
    ...(options.binary ? { "Content-Type": "application/octet-stream" } :
      body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(options.returnRows ? { "Prefer": "return=representation" } : {}) };
  let response;
  try {
    response = await fetch(new URL(path, origin), {
      method, headers, body:body===undefined ? undefined : options.binary ? body : JSON.stringify(body),
      cache:"no-store", credentials:"omit", redirect:"error", signal:AbortSignal.timeout(12000),
    });
  } catch { reject("QA_LOCAL_HTTP_TRANSPORT_FAILED"); }
  const raw = await response.arrayBuffer();
  let parsed = null;
  if (!options.binary || !response.ok) {
    try { parsed = JSON.parse(Buffer.from(raw).toString("utf8")); } catch { /* non-JSON success */ }
  }
  return { ok:response.ok, status:response.status, data:parsed, raw:new Uint8Array(raw) };
}

function expectStatus(result, label) {
  if (!result.ok) reject("QA_LOCAL_" + label + "_HTTP_" + safeStatus(result));
  return result.data;
}
function owned(rows,id) { return Array.isArray(rows)&&rows.length===1&&rows[0]?.id===id; }
function hidden(rows) { return Array.isArray(rows)&&rows.length===0; }
const select = (table,id,columns="id") => "/rest/v1/" + table + "?id=eq." + id +
  "&select=" + encodeURIComponent(columns) + "&limit=2";

function seedTwoLocalCompanies(a,b,folder,container) {
  const v = [a,b];
  for (const x of v) for(const key of ["userId","clinicId"]) requireUUID(x[key]);
  const records = v.map((actor,i)=>({
    ...actor, alias:i===0 ? "a" : "b",
    slug:"b4-local-"+(i===0?"a":"b")+"-"+actor.clinicId.slice(0,8),
  }));
  const values = (cols)=>records.map(x=>cols.map(c=>"'"+x[c]+"'").join(",")).join("),\n(");
  // All interpolated values are generated UUIDs or constant literals, never user input.
  const clinicValues=records.map(x=>
    "('"+x.clinicId+"','DF isolated beta4 fixture "+x.alias+"','"+x.slug+"','"+x.userId+"')").join(",\n");
  const memberValues=records.map(x=>
    "('"+x.clinicId+"','"+x.userId+"','CEO','active')").join(",\n");
  const profileValues=records.map(x=>
    "('"+x.userId+"','"+x.clinicId+"','CEO','CEO',false)").join(",\n");
  const roles=records.map(x=>"('"+x.userId+"','admin')").join(",\n");
  const subscriptionValues=records.map(x=>
    "('company','"+x.clinicId+"','company_initial','active',1,now(),now()+interval '1 month','asaas','sandbox')").join(",\n");
  const sql = [
    "BEGIN;",
    "SET LOCAL statement_timeout = '18s';",
    "INSERT INTO public.clinics(id,name,slug,owner_id) VALUES "+clinicValues+";",
    "INSERT INTO public.clinic_members(clinic_id,user_id,role,status) VALUES "+memberValues+";",
    "INSERT INTO public.profiles(id,clinic_id,role,account_subtype,is_default_admin) VALUES "+
      profileValues+" ON CONFLICT(id) DO UPDATE SET clinic_id=excluded.clinic_id,"+
      " role=excluded.role,account_subtype=excluded.account_subtype,is_default_admin=false;",
    "INSERT INTO public.user_roles(user_id,role) VALUES "+roles+" ON CONFLICT DO NOTHING;",
    "INSERT INTO public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day,"+
       "current_period_start,current_period_end,billing_provider,provider_environment) VALUES "+
       subscriptionValues+";",
    "COMMIT;",
    "NOTIFY pgrst, 'reload schema';",
  ].join("\n");
  if (!/^supabase_db_dtfipo_beta4_local$/.test(container)) reject("QA_LOCAL_CONTAINER_REJECTED");
  if (!folder) reject("QA_LOCAL_FOLDER_MISSING");
  const runner=spawnSync("docker",["exec","-i",container,"psql","-U","postgres","-d","postgres",
    "-v","ON_ERROR_STOP=1","-f","-"],{input:sql,encoding:"utf8",cwd:folder,timeout:30000,maxBuffer:262144});
  if (runner.error || runner.status!==0) reject("QA_LOCAL_FIXTURE_SQL_SETUP_FAILED");
}

async function createActor(origin,anonKey,serviceKey,label) {
  const email="dentalflow-ci-b4-"+label+"-"+randomUUID()+"@example.invalid";
  const password="Df!"+randomBytes(18).toString("base64url")+"9aA";
  const created=endpoint(origin,"/auth/v1/admin/users","POST",serviceKey,serviceKey,
    {email,password,email_confirm:true,user_metadata:{synthetic_ci:true}});
  const json=expectStatus(await created,"ADMIN_CREATE");
  const id=requireUUID(json?.id ?? json?.user?.id);
  const token=expectStatus(await endpoint(origin,"/auth/v1/token?grant_type=password",
    "POST",anonKey,anonKey,{email,password}),"PASSWORD_AUTH");
  if (!token?.access_token || token?.user?.id!==id) reject("QA_LOCAL_REAL_AUTH_MISMATCH");
  const me=expectStatus(await endpoint(origin,"/auth/v1/user","GET",anonKey,token.access_token),
    "GET_USER");
  if (me?.id!==id) reject("QA_LOCAL_USER_SESSION_MISMATCH");
  return {userId:id,jwt:token.access_token,clinicId:randomUUID(),label,email,password};
}

async function checkOwnAndForeign(origin,key,actor,other,patientId,caseId) {
  const mine=expectStatus(await endpoint(origin,select("patients",patientId,"id,clinic_id"),
    "GET",key,actor.jwt),"OWN_PATIENT_READ");
  if (!owned(mine,patientId)||mine[0].clinic_id!==actor.clinicId)
    reject("QA_LOCAL_OWN_PATIENT_LINK_BROKEN");
  const foreign=expectStatus(await endpoint(origin,select("patients",other.patientId,"id"),
    "GET",key,actor.jwt),"FOREIGN_PATIENT_READ");
  if (!hidden(foreign)) reject("QA_LOCAL_FOREIGN_PATIENT_VISIBLE");
  const ownCase=expectStatus(await endpoint(origin,select("cases",caseId,"id,patient_id,notes"),
    "GET",key,actor.jwt),"OWN_CASE_READ");
  if (!owned(ownCase,caseId)||ownCase[0].patient_id!==patientId)
    reject("QA_LOCAL_OWN_CASE_LINK_BROKEN");
  const otherCase=expectStatus(await endpoint(origin,select("cases",other.caseId),
    "GET",key,actor.jwt),"FOREIGN_CASE_READ");
  if (!hidden(otherCase)) reject("QA_LOCAL_FOREIGN_CASE_VISIBLE");
  const edited=expectStatus(await endpoint(origin,"/rest/v1/cases?id=eq."+caseId+"&select=id,notes",
    "PATCH",key,actor.jwt,{notes:"DF-STAGE4-OWN-EDIT"},{returnRows:true}),"OWN_CASE_EDIT");
  if (!owned(edited,caseId)||edited[0].notes!=="DF-STAGE4-OWN-EDIT")
    reject("QA_LOCAL_OWN_CASE_EDIT_MISSING");
  const failed=await endpoint(origin,"/rest/v1/cases?id=eq."+other.caseId+"&select=id",
    "PATCH",key,actor.jwt,{notes:"DF-STAGE4-FORGED-EDIT"},{returnRows:true});
  if (failed.ok && !hidden(failed.data)) reject("QA_LOCAL_FOREIGN_CASE_EDIT_ALLOWED");
  const ownAfter=expectStatus(await endpoint(origin,select("cases",caseId,"id,patient_id"),
    "GET",key,actor.jwt),"OWN_CASE_READBACK");
  if (!owned(ownAfter,caseId) || ownAfter[0].patient_id!==patientId)
    reject("QA_LOCAL_OWN_CASE_INTEGRITY_LOST");
  const relink=await endpoint(origin,"/rest/v1/cases?id=eq."+caseId+"&select=id,patient_id",
    "PATCH",key,actor.jwt,{patient_id:other.patientId},{returnRows:true});
  if (relink.ok && !hidden(relink.data)) reject("QA_LOCAL_FOREIGN_PATIENT_RELINK_ALLOWED");
  const afterRelink=expectStatus(await endpoint(origin,select("cases",caseId,"id,patient_id"),
    "GET",key,actor.jwt),"OWN_CASE_AFTER_RELINK");
  if (!owned(afterRelink,caseId)||afterRelink[0].patient_id!==patientId)
    reject("QA_LOCAL_FOREIGN_PATIENT_RELINK_PERSISTED");
}

async function createOwnPatientAndCase(origin,key,actor) {
  const patientId=randomUUID(),patientKey=randomUUID();
  const patient=expectStatus(await endpoint(origin,"/rest/v1/rpc/create_patient_idempotent_v1",
    "POST",key,actor.jwt,{_key:patientKey,_id:patientId,_values:{name:"DentalFlow isolated QA "+actor.label}}),
    "PATIENT_CREATE_RPC");
  if (patient?.id!==patientId || patient.clinic_id!==actor.clinicId)
    reject("QA_LOCAL_PATIENT_CREATION_NOT_OWNED");
  const caseId=randomUUID(),caseKey=randomUUID();
  const payload={_key:caseKey,_input:{id:caseId,patient_id:patientId,
    delivery_date:"2026-11-23",arch:"superior",teeth_numbers:[11],notes:"DF-STAGE4-NEW"}};
  const saved=expectStatus(await endpoint(origin,"/rest/v1/rpc/create_case_idempotent_v1",
    "POST",key,actor.jwt,payload),"CASE_CREATE_RPC");
  if (saved?.case?.id!==caseId || saved?.case?.patient_id!==patientId)
    reject("QA_LOCAL_CASE_CREATION_NOT_OWNED");
  const replay=expectStatus(await endpoint(origin,"/rest/v1/rpc/create_case_idempotent_v1",
    "POST",key,actor.jwt,payload),"CASE_RETRY");
  if (replay?.case?.id!==caseId || replay?.cases?.length!==1)
    reject("QA_LOCAL_CASE_RETRY_DUPLICATED");
  actor.patientId=patientId;actor.caseId=caseId;
}

async function checkRealStorage(origin,key,actor,other) {
  const bytes=Buffer.from("solid dentalflow_ci\nfacet normal 0 0 1\nendfacet\nendsolid dentalflow_ci\n");
  const relative=actor.caseId+"/stage4-"+randomUUID()+".stl";
  const reserved=expectStatus(await endpoint(origin,"/rest/v1/rpc/reserve_storage_upload",
    "POST",key,actor.jwt,{_size_bytes:bytes.length,_bucket:"case-files",_object_path:relative,
      _source_type:"case_attachment",_case_id:actor.caseId,_patient_id:null,
      _original_name:"synthetic.stl",_mime_type:"application/octet-stream"}),"RESERVE_UPLOAD");
  const fileId=Array.isArray(reserved)?reserved[0]?.file_id:reserved?.file_id;
  requireUUID(fileId);
  const upload=await endpoint(origin,"/storage/v1/object/case-files/"+relative,
    "POST",key,actor.jwt,bytes,{binary:true});
  expectStatus(upload,"OWN_STORAGE_UPLOAD");
  const own=await endpoint(origin,"/storage/v1/object/authenticated/case-files/"+relative,
    "GET",key,actor.jwt,undefined,{binary:true});
  if (!own.ok || !Buffer.from(own.raw).equals(bytes))
    reject("QA_LOCAL_OWN_STORAGE_BYTES_UNVERIFIED");
  const otherRead=await endpoint(origin,"/storage/v1/object/authenticated/case-files/"+relative,
    "GET",key,other.jwt,undefined,{binary:true});
  if (otherRead.ok) reject("QA_LOCAL_FOREIGN_STORAGE_READ_ALLOWED");
  const linked=expectStatus(await endpoint(origin,"/rest/v1/case_attachments",
    "POST",key,actor.jwt,{case_id:actor.caseId,file_name:"synthetic.stl",
      storage_path:relative,size_bytes:bytes.length,mime_type:"application/octet-stream",
      uploaded_by:actor.userId,kind:"scans"},{returnRows:true}),"CASE_ATTACHMENT_LINK");
  if (!Array.isArray(linked)||linked.length!==1||linked[0].case_id!==actor.caseId)
    reject("QA_LOCAL_ATTACHMENT_LINK_UNVERIFIED");
  expectStatus(await endpoint(origin,"/rest/v1/rpc/complete_storage_upload",
    "POST",key,actor.jwt,{_file_id:fileId,_source_id:linked[0].id}),"FINISH_UPLOAD");
  const ownRows=expectStatus(await endpoint(origin,"/rest/v1/case_attachments?case_id=eq."+
    actor.caseId+"&select=id,case_id","GET",key,actor.jwt),"OWN_ATTACHMENT_READ");
  if (!Array.isArray(ownRows)||!ownRows.some(x=>x.id===linked[0].id))
    reject("QA_LOCAL_OWN_ATTACHMENT_HIDDEN");
  const otherRows=expectStatus(await endpoint(origin,"/rest/v1/case_attachments?case_id=eq."+
    actor.caseId+"&select=id","GET",key,other.jwt),"FOREIGN_ATTACHMENT_READ");
  if (!hidden(otherRows)) reject("QA_LOCAL_FOREIGN_ATTACHMENT_VISIBLE");
  const foreignDelete=await endpoint(origin,
    "/rest/v1/case_attachments?id=eq."+linked[0].id+"&select=id",
    "DELETE",key,other.jwt,undefined,{returnRows:true});
  if (foreignDelete.ok && !hidden(foreignDelete.data))
    reject("QA_LOCAL_FOREIGN_ATTACHMENT_DELETE_ALLOWED");
  const preserved=await endpoint(origin,"/storage/v1/object/authenticated/case-files/"+relative,
    "GET",key,actor.jwt,undefined,{binary:true});
  if (!preserved.ok || !Buffer.from(preserved.raw).equals(bytes))
    reject("QA_LOCAL_FOREIGN_ACTION_CHANGED_BYTES");
  return {bucket:"case-files",file_content_synthetic:true};
}

export async function run() {
  if (process.env.CI!=="true"||process.env.DENTALFLOW_BETA4_LOCAL_TEST!=="true")
    reject("QA_LOCAL_CI_ONLY");
  const folder=process.env.DENTALFLOW_BETA4_LOCAL_DIR;
  const container=process.env.DENTALFLOW_BETA4_LOCAL_DB_CONTAINER;
  if (!folder || !container || !folder.startsWith(process.env.RUNNER_TEMP+"/")
      || container!=="supabase_db_dtfipo_beta4_local")
    reject("QA_LOCAL_RUNNER_BOUNDARY_FAILED");
  let local;
  try {
    local=parseLocalStatus(execFileSync("supabase",["status","-o","env"],
      {cwd:folder,encoding:"utf8",timeout:15000,stdio:["ignore","pipe","ignore"]}));
  } catch { reject("QA_LOCAL_STATUS_UNAVAILABLE"); }
  const origin=verifyLoopback(local.url);
  if (!local.anonKey || !local.adminKey)
    reject("QA_LOCAL_CREDENTIALS_UNAVAILABLE");
  const a=await createActor(origin,local.anonKey,local.adminKey,"a");
  const b=await createActor(origin,local.anonKey,local.adminKey,"b");
  seedTwoLocalCompanies(a,b,folder,container);
  await createOwnPatientAndCase(origin,local.anonKey,a);
  await createOwnPatientAndCase(origin,local.anonKey,b);
  await checkOwnAndForeign(origin,local.anonKey,a,b,a.patientId,a.caseId);
  await checkOwnAndForeign(origin,local.anonKey,b,a,b.patientId,b.caseId);
  await checkRealStorage(origin,local.anonKey,a,b);
  await checkRealStorage(origin,local.anonKey,b,a);
  const webUi = process.env.DENTALFLOW_BETA4_BROWSER_TEST === "true"
    ? await (await import("./saas-beta4-local-browser-ui.mjs")).checkLocalWebUI({
        origin,anonKey:local.anonKey,adminKey:local.adminKey,actors:[a,b]})
    : {web_ui_own_case_visible:0,web_ui_cross_tenant_case_hidden:0,
       web_ui_case_detail_opened:0,web_ui_not_executed:true};
  return {
    protocol:"BETA-4-REAL-LOCAL-HTTP-V1",passed:true,
    actors_authenticated:2,clinics:2,patients_created_by_real_user_rpc:2,
    cases_created_by_real_user_rpc:2,case_idempotent_retries_verified:2,
    own_case_edits_verified:2,cross_company_patient_and_case_reads_denied:4,
    cross_company_case_edits_denied:2,cross_company_patient_relinks_denied:2,
    real_storage_upload_and_download_verified:2,real_foreign_storage_download_denied:2,
    foreign_attachment_metadata_reads_denied:2,foreign_attachment_metadata_deletes_denied:2,
    tested_environment:"Supabase CLI local ephemeral HTTP, full REST/Auth/Storage",
    ...webUi,runtime_ui_verified:webUi.web_ui_case_detail_opened===2,
    web_deployment_verified:false,production_touched:false,
    asaas_invoked:false,clinical_data_included:false,
    source_claim:"CI integration of temporary synthetic fixtures only, not commercial beta release",
  };
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  run().then(x=>process.stdout.write(JSON.stringify(x)+"\n")).catch(error=>{
    // Never expose API errors, URLs, tokens, data or SQL to the Actions log.
    const code=/^QA_LOCAL_[A-Z0-9_]+$/.test(error?.message||"")
      ? error.message:"QA_LOCAL_UNCLASSIFIED_FAILURE";
    process.stderr.write(JSON.stringify({protocol:"BETA-4-REAL-LOCAL-HTTP-V1",passed:false,code})+"\n");
    process.exitCode=1;
  });
}
