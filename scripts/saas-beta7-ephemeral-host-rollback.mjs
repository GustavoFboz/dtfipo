/**
 * Ephemeral HTTP hosting A -> B -> A rehearsal for two real DentalFlow
 * Web build directories, with immutable SHA-256 provenance and fail-closed
 * local-only routing. This is NOT a production/Lovable deployment.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createServer} from "node:http";
import {lstatSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync} from "node:fs";
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";

const SHA=/^[a-f0-9]{40}$/;
const sha256=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const error=(code)=>{throw new Error(code);};
const inside=(root,path)=>path.startsWith(root+sep);
export function validateGitSHA(value){
  if(!SHA.test(value??""))error("BETA7_SHA_INVALID");
  return value;
}
export function inspectBuild(root,sourceSha,{trustedWorkspace=null}={}) {
  validateGitSHA(sourceSha);
  const checkedRoot=realpathSync(root);
  if(trustedWorkspace!==null){
    const checkedWorkspace=realpathSync(trustedWorkspace);
    if(!inside(checkedWorkspace,checkedRoot))error("BETA7_ROOT_OUTSIDE_EPHEMERAL_WORKSPACE");
    const actual=execFileSync("git",["-C",checkedRoot,"rev-parse","HEAD"],
      {encoding:"utf8",timeout:8000,stdio:["ignore","pipe","ignore"]}).trim();
    if(actual!==sourceSha)error("BETA7_BUILD_SOURCE_SHA_MISMATCH");
  }
  const publicDir=join(checkedRoot,".output","public");
  if(!existsSync(publicDir)||!lstatSync(publicDir).isDirectory())
    error("BETA7_NO_WEB_BUILD");
  const files=[];
  function visit(folder){
    for(const ent of readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      const path=join(folder,ent.name);
      // A release must be immutable: no symlink escape, sockets or side effects.
      if(ent.isSymbolicLink() || (!ent.isDirectory()&&!ent.isFile()))
        error("BETA7_UNSAFE_BUILD_ENTRY");
      if(ent.isDirectory())visit(path);
      else {
        const name=relative(publicDir,path).split(sep).join("/");
        if(name.startsWith(".")||name.includes("/.")||name.includes("\\"))
          error("BETA7_UNSAFE_BUILD_FILE");
        const bytes=readFileSync(path);
        if(!bytes.length)error("BETA7_EMPTY_ASSET");
        files.push({path:name,sha256:sha256(bytes),bytes:bytes.length});
      }
    }
  }
  visit(publicDir);
  if(files.length<2)error("BETA7_MISSING_BUILD_ASSETS");
  const asset=files.find(f=>f.path.endsWith(".js") && f.path.includes("/"))
    ??files.find(f=>f.path.endsWith(".js"));
  if(!asset)error("BETA7_JS_ASSET_MISSING");
  const manifest=sha256(Buffer.from(files.map(f=>[f.path,f.sha256,f.bytes].join(" ")+"\n").join(""),"utf8"));
  return {root:checkedRoot,publicDir,source_sha:sourceSha,content_sha256:manifest,
    asset,files_count:files.length,total_bytes:files.reduce((n,f)=>n+f.bytes,0),
    paths:new Map(files.map(f=>[f.path,f]))};
}
function typeFor(path) {
  if(path.endsWith(".js"))return "text/javascript; charset=utf-8";
  if(path.endsWith(".css"))return "text/css; charset=utf-8";
  if(path.endsWith(".html"))return "text/html; charset=utf-8";
  if(path.endsWith(".json"))return "application/json; charset=utf-8";
  return "application/octet-stream";
}
export function stageSwitch(workspace,tag,release){
  if(!/^(a|b)$/.test(tag))error("BETA7_TAG_INVALID");
  const safeWorkspace=realpathSync(workspace);
  const active=join(safeWorkspace,"active-public");
  const target=realpathSync(release.publicDir);
  if(!inside(safeWorkspace,target)||!target.endsWith(sep+".output"+sep+"public"))
    error("BETA7_TARGET_OUTSIDE_EPHEMERAL_WORKSPACE");
  const provisional=join(safeWorkspace,"next-active-"+tag);
  rmSync(provisional,{force:true});
  symlinkSync(target,provisional,"dir");
  renameSync(provisional,active); // atomic replacement of LOCAL symlink
  if(realpathSync(active)!==target)error("BETA7_ATOMIC_SWITCH_FAILED");
  return active;
}
export function createLocalHost(workspace,releases){
  const safeWorkspace=realpathSync(workspace);
  const targetByDir=new Map(releases.map(r=>[realpathSync(r.publicDir),r]));
  const activeLink=join(safeWorkspace,"active-public");
  return createServer((request,response)=>{
    response.setHeader("Cache-Control","no-store");
    response.setHeader("X-Content-Type-Options","nosniff");
    try {
      if(request.method!=="GET" && request.method!=="HEAD"){
        response.writeHead(405);return response.end();
      }
      if(!existsSync(activeLink)){response.writeHead(503);return response.end();}
      const active=targetByDir.get(realpathSync(activeLink));
      if(!active){response.writeHead(503);return response.end();}
      const url=new URL(request.url??"/","http://127.0.0.1:4177");
      if(url.search || url.hash){response.writeHead(400);return response.end();}
      const pathname=url.pathname;
      response.setHeader("X-DentalFlow-Test-Source",active.source_sha);
      if(pathname==="/__beta7_local_build"){
        response.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});
        return response.end(request.method==="HEAD"?"":JSON.stringify({
          source_sha:active.source_sha,content_sha256:active.content_sha256,
          assets:active.files_count
        }));
      }
      // This harness serves real built STATIC assets. It is not a Nitro
      // server and must never respond to any clinical, admin or billing API.
      if(pathname.startsWith("/api/")||pathname.startsWith("/auth/")||
          pathname.includes("\\")||pathname.includes("%")||pathname.includes("..")){
        response.writeHead(404);return response.end();
      }
      const name=pathname.slice(1);
      const meta=active.paths.get(name);
      if(!meta){response.writeHead(404);return response.end();}
      const file=join(active.publicDir,name);
      if(!inside(active.publicDir,resolve(file))){response.writeHead(404);return response.end();}
      const bytes=readFileSync(file);
      if(sha256(bytes)!==meta.sha256){response.writeHead(500);return response.end();}
      response.setHeader("Content-Type",typeFor(name));
      response.setHeader("X-DentalFlow-Test-Asset-SHA256",meta.sha256);
      response.writeHead(200);
      return response.end(request.method==="HEAD"?"":bytes);
    }catch{
      response.writeHead(503);return response.end();
    }
  });
}
async function getReceipt(origin){
  const r=await fetch(origin+"/__beta7_local_build",{signal:AbortSignal.timeout(5000),redirect:"error",cache:"no-store"});
  if(!r.ok)error("BETA7_HOST_CHECK_FAILED");
  return r.json();
}
async function checkAsset(origin,release){
  const {asset}=release;
  const result=await fetch(origin+"/"+asset.path,{signal:AbortSignal.timeout(5000),redirect:"error",cache:"no-store"});
  if(!result.ok || result.headers.get("X-DentalFlow-Test-Source")!==release.source_sha)
    error("BETA7_HOST_SOURCE_NOT_SERVED");
  const data=Buffer.from(await result.arrayBuffer());
  if(sha256(data)!==asset.sha256 ||
    result.headers.get("X-DentalFlow-Test-Asset-SHA256")!==asset.sha256)
    error("BETA7_ASSET_DIGEST_MISMATCH");
}
export async function rehearse(workspace,oldRelease,newRelease,{port=4177}={}){
  if(oldRelease.source_sha===newRelease.source_sha)error("BETA7_SAME_SOURCE_NOT_ROLLBACK");
  const server=createLocalHost(workspace,[oldRelease,newRelease]);
  try{
    await new Promise((resolve,reject)=>{
      server.once("error",reject);
      server.listen(port,"127.0.0.1",resolve);
    });
    const address=server.address();
    if(!address||typeof address==="string"||address.address!=="127.0.0.1")
      error("BETA7_EXTERNAL_HOST_DENIED");
    const origin="http://127.0.0.1:"+address.port;
    const observed=[];
    for(const [phase,release,tag] of [
      ["prior",oldRelease,"a"],["deploy_candidate",newRelease,"b"],
      ["rollback_prior",oldRelease,"a"]]){
      stageSwitch(workspace,tag,release);
      const receipt=await getReceipt(origin);
      assert.equal(receipt.source_sha,release.source_sha);
      assert.equal(receipt.content_sha256,release.content_sha256);
      assert.equal(receipt.assets,release.files_count);
      await checkAsset(origin,release);
      // No application billing/clinical API is hosted in this dry run.
      const forbidden=await fetch(origin+"/api/billing/asaas-checkout",{signal:AbortSignal.timeout(3000)});
      if(forbidden.status!==404)error("BETA7_BILLING_API_EXPOSED");
      observed.push({phase,source_sha:release.source_sha,content_sha256:release.content_sha256,
        representative_asset_sha256:release.asset.sha256});
    }
    if(observed[0].source_sha!==observed[2].source_sha ||
       observed[0].content_sha256!==observed[2].content_sha256 ||
       observed[0].representative_asset_sha256!==observed[2].representative_asset_sha256)
       error("BETA7_ROLLBACK_INTEGRITY_FAILED");
    return {protocol:"DENTALFLOW_BETA7_EPHEMERAL_STATIC_HOST_A_B_A_V1",
      passed:true,network_origin:"loopback_only",phases:observed,
      old_release_files:oldRelease.files_count,new_release_files:newRelease.files_count,
      immutable_web_builds_verified:true,atomic_local_deploy_and_rollback_verified:true,
      web_static_assets_served_over_http:true,
      backend_ssr_served:false,auth_verified:false,production_host_rolled_back:false,
      asaas_invoked:false,external_secret_access:false,clinical_data_used:false,
      release_authorized:false};
  }finally{
    await new Promise(done=>server.close(done));
  }
}
export async function run(){
  const workspace=process.env.DENTALFLOW_BETA7_WORKSPACE;
  const runner=process.env.RUNNER_TEMP;
  if(process.env.CI!=="true"||process.env.DENTALFLOW_BETA7_LOCAL_TEST!=="true"
     ||!runner||!workspace||resolve(workspace)!==resolve(runner,"dentalflow-beta7-host"))
    error("BETA7_CI_ONLY");
  const oldRoot=join(workspace,"baseline"),newRoot=join(workspace,"candidate");
  if(!existsSync(oldRoot)||!existsSync(newRoot))error("BETA7_WORKTREES_MISSING");
  const readCommit=(root)=>validateGitSHA(execFileSync("git",["-C",root,"rev-parse","HEAD"],
    {encoding:"utf8",timeout:8000,stdio:["ignore","pipe","ignore"]}).trim());
  const old=inspectBuild(oldRoot,readCommit(oldRoot),{trustedWorkspace:workspace});
  const next=inspectBuild(newRoot,readCommit(newRoot),{trustedWorkspace:workspace});
  if(old.content_sha256===next.content_sha256)
    error("BETA7_WEB_BUILDS_IDENTICAL");
  return rehearse(workspace,old,next);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  run().then(r=>process.stdout.write(JSON.stringify(r)+"\n")).catch(e=>{
    const code=/^BETA7_[A-Z0-9_]+$/.test(e?.message??"")?e.message:"BETA7_UNCLASSIFIED_FAILURE";
    // Never log environment, keys, local URLs, HTML, source contents or names.
    process.stderr.write(JSON.stringify({protocol:"DENTALFLOW_BETA7_EPHEMERAL_STATIC_HOST_A_B_A_V1",passed:false,code})+"\n");
    process.exitCode=1;
  });
}
