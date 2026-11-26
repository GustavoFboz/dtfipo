import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>{
  const chain:{select:any;eq:any;order:any}={
    select:vi.fn(),eq:vi.fn(),order:vi.fn()
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return {chain,from:vi.fn(()=>chain),rpc:vi.fn()};
});
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:mocks.from,rpc:mocks.rpc}}));
import {acceptPublishedLegalDocument,listPublishedLegalDocuments} from "./saas-legal-acceptance";

const d={
  id:"74200000-0000-4000-8000-000000000040",
  document_kind:"saas_terms" as const,version_label:"2026-11-02-v1",
  body_markdown:"Synthetic fixture only. ".repeat(7),
  body_sha256:"a".repeat(64),published_at:"2026-11-02T00:00:00Z"
};
const clinic="74200000-0000-4000-8000-000000000010";
const receipt={
  receipt_id:"74200000-0000-4000-8000-000000000050",
  document_version_id:d.id,document_sha256:d.body_sha256,clinic_id:clinic,
  actor_id:"74200000-0000-4000-8000-000000000001",
  accepted_at:"2026-11-02T00:10:00Z",
};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.chain.select.mockReturnValue(mocks.chain);
  mocks.chain.eq.mockReturnValue(mocks.chain);
  mocks.chain.order.mockResolvedValue({data:[d],error:null});
  mocks.rpc.mockResolvedValue({data:receipt,error:null});
});
describe("approved-only legal acceptance contract",()=>{
  it("does not contact Cloud when legal approval is not enabled",async()=>{
    await expect(listPublishedLegalDocuments(false)).resolves.toEqual([]);
    await expect(acceptPublishedLegalDocument(d,clinic,false)).rejects.toThrow("SAAS_LEGAL_NOT_APPROVED_FOR_USE");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reads only published documents with valid version and digest",async()=>{
    await expect(listPublishedLegalDocuments(true)).resolves.toEqual([d]);
    expect(mocks.from).toHaveBeenCalledWith("saas_legal_document_versions");
    expect(mocks.chain.eq).toHaveBeenCalledWith("status","published");
    mocks.chain.order.mockResolvedValue({data:[{...d,body_sha256:"invalid"}],error:null});
    await expect(listPublishedLegalDocuments(true)).rejects.toThrow("SAAS_LEGAL_DOCUMENT_INVALID");
  });
  it("never accepts a draft, missing digest or forged clinic identifier",async()=>{
    await expect(acceptPublishedLegalDocument({...d,body_sha256:"0"},clinic,true))
      .rejects.toThrow("SAAS_LEGAL_DOCUMENT_INVALID");
    await expect(acceptPublishedLegalDocument(d,"fake",true))
      .rejects.toThrow("SAAS_LEGAL_CLINIC_INVALID");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("sends only immutable document id, expected digest and target clinic to checked RPC",async()=>{
    await expect(acceptPublishedLegalDocument(d,clinic,true)).resolves.toEqual(receipt);
    expect(mocks.rpc).toHaveBeenCalledWith("record_saas_legal_acceptance",{
      p_document_version_id:d.id,p_expected_sha256:d.body_sha256,p_clinic_id:clinic,
    });
  });
  it("denies server errors or forged returned receipt",async()=>{
    mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"42501"}});
    await expect(acceptPublishedLegalDocument(d,clinic,true)).rejects.toThrow("SAAS_LEGAL_ACCEPTANCE_REJECTED");
    mocks.rpc.mockResolvedValueOnce({data:{...receipt,clinic_id:"74200000-0000-4000-8000-000000000020"},error:null});
    await expect(acceptPublishedLegalDocument(d,clinic,true)).rejects.toThrow("SAAS_LEGAL_RECEIPT_INVALID");
  });
});
