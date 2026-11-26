import {supabase} from "@/integrations/supabase/client";

/**
 * Deliberately dormant until approved legal documents and the reviewed database
 * migration are deployed. No existing checkout or account session is blocked.
 */
export const legalAcceptanceEnabled=()=>import.meta.env.VITE_SAAS_LEGAL_ACCEPTANCE_ENABLED==="true";

export type ApprovedLegalDocument={
  id:string; document_kind:"saas_terms"|"privacy_notice"|"dpa";
  version_label:string; body_markdown:string; body_sha256:string; published_at:string;
};
export type LegalAcceptanceReceipt={
  receipt_id:string; document_version_id:string; document_sha256:string;
  clinic_id:string; actor_id:string; accepted_at:string;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest=/^[a-f0-9]{64}$/;
export function requireApprovedDocument(doc:ApprovedLegalDocument){
  if(!doc || !uuid.test(doc.id) || !digest.test(doc.body_sha256) ||
    !["saas_terms","privacy_notice","dpa"].includes(doc.document_kind) ||
    !/^\d{4}-\d{2}-\d{2}-v\d+$/.test(doc.version_label) ||
    typeof doc.body_markdown!=="string" || doc.body_markdown.length<80 ||
    !Number.isFinite(Date.parse(doc.published_at)))
    throw new Error("SAAS_LEGAL_DOCUMENT_INVALID");
}
export async function listPublishedLegalDocuments(
  enabled:boolean=legalAcceptanceEnabled()
):Promise<ApprovedLegalDocument[]>{
  if(!enabled)return [];
  const {data,error}=await supabase.from("saas_legal_document_versions" as never)
    .select("id,document_kind,version_label,body_markdown,body_sha256,published_at")
    .eq("status","published").order("published_at",{ascending:false});
  if(error)throw new Error("SAAS_LEGAL_DOCUMENTS_UNAVAILABLE");
  const docs=(data??[]) as unknown as ApprovedLegalDocument[];
  for(const doc of docs)requireApprovedDocument(doc);
  return docs;
}
export async function acceptPublishedLegalDocument(
  document:ApprovedLegalDocument,clinicId:string,
  enabled:boolean=legalAcceptanceEnabled()
):Promise<LegalAcceptanceReceipt>{
  if(!enabled)throw new Error("SAAS_LEGAL_NOT_APPROVED_FOR_USE");
  requireApprovedDocument(document);
  if(!uuid.test(clinicId))throw new Error("SAAS_LEGAL_CLINIC_INVALID");
  // The actual published document and actor/owner are independently checked
  // by the definer RPC. Client inputs can never select another clinic's owner.
  const {data,error}=await supabase.rpc("record_saas_legal_acceptance" as never,{
    p_document_version_id:document.id,
    p_expected_sha256:document.body_sha256,
    p_clinic_id:clinicId,
  } as never);
  if(error)throw new Error("SAAS_LEGAL_ACCEPTANCE_REJECTED");
  const r=data as unknown as LegalAcceptanceReceipt;
  if(!r || !uuid.test(r.receipt_id) || r.document_version_id!==document.id ||
    r.document_sha256!==document.body_sha256 || r.clinic_id!==clinicId ||
    !uuid.test(r.actor_id) || !Number.isFinite(Date.parse(r.accepted_at)))
    throw new Error("SAAS_LEGAL_RECEIPT_INVALID");
  return r;
}
