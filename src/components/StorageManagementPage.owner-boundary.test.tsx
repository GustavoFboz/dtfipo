// @vitest-environment happy-dom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {StorageManagementPage} from "./StorageManagementPage";

const deps=vi.hoisted(()=>({
  owner:"user-a",
  profile:vi.fn(),
  fetchFiles:vi.fn(),
  refresh:vi.fn(),
  deleteFile:vi.fn(),
}));
vi.mock("@/hooks/use-auth-ready",()=>({
  useAuthReady:()=>({isReady:true,userId:deps.owner}),
}));
vi.mock("@/lib/api",()=>({fetchProfile:deps.profile}));
vi.mock("@tanstack/react-router",async()=>({
  Link:({children}:{children:React.ReactNode})=>children,
}));
vi.mock("@/components/StorageUploadReservations",()=>({StorageUploadReservations:()=>null}));
vi.mock("@/lib/confirm",()=>({confirm:vi.fn(async()=>false)}));
vi.mock("@/lib/storage",()=>({
  storageFilesScopeKey:(owner:string,clinic:string)=>["storage_files",owner,clinic],
  fetchStorageFiles:deps.fetchFiles,
  deleteManagedStorageFile:deps.deleteFile,
  refreshStorageUsage:deps.refresh,
  getStorageUsageSnapshot:()=>fixedUsageSnapshot,
  subscribeStorageUsage:()=>()=>{},
  formatStorageBytes:(x:number)=>String(x)+" bytes",
  storageSourceLabel:(x:string)=>x,
}));
vi.mock("sonner",()=>({toast:{error:vi.fn(),success:vi.fn()}}));

const fixedUsageSnapshot={data:{clinic_id:"clinic-a",used_bytes:93450,limit_bytes:100000,
    available_bytes:6550,usage_ratio:.93,file_count:4,almost_full:true,full:false,quota_enforced:true},loading:false,error:null,revision:0};
let host:HTMLDivElement,root:Root,cache:QueryClient;
const owner=(userId:string,clinicId:string)=>({id:userId,clinic_id:clinicId,role:"CEO",account_subtype:"CEO",is_default_admin:false});
const record=(clinic:string,name:string)=>({id:name,clinic_id:clinic,original_name:name,mime_type:"application/pdf",
  source_type:"patient_attachment",size_bytes:100,status:"ready",created_at:"2026-10-01T00:00:00Z"});
function deferred<T>() {let resolve!:(value:T)=>void;return {promise:new Promise<T>(r=>{resolve=r}),resolve:(v:T)=>resolve(v)};}
async function settle(){await act(async()=>{await new Promise(done=>setTimeout(done,30))});}
async function render(){
  await act(async()=>{root.render(createElement(QueryClientProvider,{client:cache},createElement(StorageManagementPage)))});
  await settle();
}
beforeEach(()=>{
  vi.clearAllMocks();deps.owner="user-a";
  deps.profile.mockImplementation(async()=>owner(deps.owner,deps.owner==="user-a"?"clinic-a":"clinic-b"));
  deps.fetchFiles.mockImplementation(async(clinic:string)=>clinic==="clinic-a"?[record("clinic-a","file-a.pdf")]:[record("clinic-b","file-b.pdf")]);
  deps.refresh.mockResolvedValue(null);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
});
afterEach(async()=>{await act(async()=>root.unmount());cache.clear();host.remove();});

describe("storage management cannot show another company's cached records",()=>{
  it("never displays the previous company's list or usage after an account switch",async()=>{
    await render();
    expect(host.textContent).toContain("file-a.pdf");
    deps.owner="user-b";await render();
    expect(host.textContent).toContain("file-b.pdf");
    expect(host.textContent).not.toContain("file-a.pdf");
    expect(host.textContent).not.toContain("93450 bytes");
    expect(deps.fetchFiles).toHaveBeenLastCalledWith("clinic-b");
  });
  it("refuses stale admin profile when authentication belongs to another owner",async()=>{
    deps.owner="user-b";
    deps.profile.mockResolvedValue(owner("user-a","clinic-a"));
    await render();
    expect(host.textContent).toContain("Área administrativa");
    expect(host.textContent).not.toContain("file-a.pdf");
    expect(deps.fetchFiles).not.toHaveBeenCalled();
  });
  it("cannot display a late response from a previously authenticated company",async()=>{
    const first=deferred<ReturnType<typeof record>[]>();
    deps.fetchFiles.mockImplementation((clinic:string)=>clinic==="clinic-a" ? first.promise
      :Promise.resolve([record("clinic-b","file-b.pdf")]));
    await render();
    deps.owner="user-b";await render();
    await act(async()=>first.resolve([record("clinic-a","late-file-a.pdf")]));await settle();
    expect(host.textContent).toContain("file-b.pdf");
    expect(host.textContent).not.toContain("late-file-a.pdf");
  });
});
