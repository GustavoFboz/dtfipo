import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {summarizeBetaImplementation} from './saas-beta-implementation-progress.mjs';
import {releaseDecision} from './saas-sales-release-gate.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=(root,file)=>fs.readFileSync(path.join(root,file));
const json=(root,file)=>JSON.parse(read(root,file).toString('utf8'));
const validCommit=x=>typeof x==='string' && /^[a-f0-9]{40}$/.test(x);
const fileMeta=(root,file)=>{
  const bytes=read(root,file);
  if(!bytes.length)throw Error('RELEASE_SOURCE_EMPTY');
  return {path:file,sha256:sha(bytes),bytes:bytes.length};
};
const canonicalMigrations=(root)=>{
  const base=path.join(root,'supabase/migrations');
  const paths=fs.readdirSync(base).filter(name=>name.endsWith('.sql')).sort();
  if(!paths.length)throw Error('RELEASE_MIGRATIONS_EMPTY');
  const rows=paths.map(name=>fileMeta(root,'supabase/migrations/'+name));
  const envelope=rows.map(x=>x.path+' '+x.sha256+' '+x.bytes+'\n').join('');
  return {count:rows.length,last_sql:paths.at(-1),manifest_sha256:sha(Buffer.from(envelope,'utf8'))};
};
const versionFrom=(source,re)=>{
  const value=source.match(re)?.[1];
  if(!value||!/^\d+\.\d+\.\d+$/.test(value))throw Error('RELEASE_VERSION_INVALID');
  return value;
};

export function collectReleasePreflight(root,sourceCommit,{
  rollbackCandidate=null, nativeArtifacts=[], approvals=null
}={}){
  if(!validCommit(sourceCommit))throw Error('RELEASE_SOURCE_COMMIT_INVALID');
  if(rollbackCandidate!==null && (!validCommit(rollbackCandidate)||rollbackCandidate===sourceCommit))
    throw Error('RELEASE_ROLLBACK_CANDIDATE_INVALID');
  if(!Array.isArray(nativeArtifacts))throw Error('RELEASE_ARTIFACTS_INVALID');
  const w=json(root,'src-tauri/tauri.conf.json').version;
  const cargo=versionFrom(read(root,'src-tauri/Cargo.toml').toString('utf8'),/^version\s*=\s*"([^"]+)"/m);
  const android=versionFrom(read(root,'scripts/prepare-android-release.py').toString('utf8'),/^VERSION\s*=\s*"([^"]+)"/m);
  if(w!==cargo||!/^\d+\.\d+\.\d+$/.test(w))throw Error('RELEASE_NATIVE_VERSION_MISMATCH');
  const capacitor=read(root,'capacitor.config.ts').toString('utf8');
  if(!capacitor.includes("appId: 'br.com.dentalflow.mobile'"))throw Error('RELEASE_ANDROID_PACKAGE_MISMATCH');
  const ledger=json(root,'docs/saas/IMPLEMENTATION-PROGRESS.json');
  const policy=json(root,'docs/saas/BETA-IMPLEMENTATION-SCOPE.json');
  const implementation=summarizeBetaImplementation(ledger,policy);
  const formal=releaseDecision(ledger);
  const assets=[];
  for(const asset of nativeArtifacts){
    if(!asset || !['windows','android'].includes(asset.platform) ||
       typeof asset.path!=='string' || !/^release\/[a-zA-Z0-9._-]+\.(exe|apk)$/.test(asset.path))
       throw Error('RELEASE_ARTIFACTS_INVALID');
    if(asset.platform==='windows' && !asset.path.endsWith('.exe') ||
       asset.platform==='android' && !asset.path.endsWith('.apk')) throw Error('RELEASE_ARTIFACTS_INVALID');
    assets.push({platform:asset.platform,...fileMeta(root,asset.path),signature_verified:false});
  }
  if(new Set(assets.map(x=>x.platform)).size!==assets.length)throw Error('RELEASE_DUPLICATE_PLATFORM');
  const backup=ledger.reviewed_partial_gates['6.2'];
  if(!backup || backup.some(g=>['storage-full-copy','full-isolated-recovery','current-runtime-reconciliation'].includes(g.id) && !g.complete)===false)
    throw Error('RELEASE_BACKUP_AUDIT_INVALID');
  const blockers=[
    ...(implementation.remaining_implementation_ids.length?['engineering_incomplete']:[]),
    'historical_backup_incomplete',
    'real_device_beta_approval_missing',
    'approved_terms_and_privacy_missing',
    'signed_native_artifacts_not_verified',
    'production_rollback_not_verified',
  ];
  if(rollbackCandidate===null)blockers.push('rollback_source_not_selected');
  if(assets.length!==2)blockers.push('native_artifacts_not_collected');
  if(approvals!==null)throw Error('RELEASE_APPROVAL_CANNOT_BE_INJECTED');
  const codeFiles=[
    'src/components/master/MasterSaasProtocolProgress.tsx',
    'src/lib/storage.ts','src/lib/subscriptions.ts',
    'src-tauri/tauri.conf.json','src-tauri/Cargo.toml',
    'capacitor.config.ts','scripts/prepare-android-release.py',
    'docs/saas/IMPLEMENTATION-PROGRESS.json',
    'docs/saas/BETA-IMPLEMENTATION-SCOPE.json',
  ].map(file=>fileMeta(root,file));
  return {
    schema:'dentalflow-saas-beta-release-preflight-v1',
    source_commit:sourceCommit,
    rollback_candidate_commit:rollbackCandidate,
    platform_versions:{web:json(root,'package.json').version,windows:w,android},
    migrations:canonicalMigrations(root),
    code_files:codeFiles,
    native_artifacts:assets,
    beta_implementation_percent:implementation.overall_progress_percent,
    beta_engineering_pending:implementation.remaining_implementation_ids,
    formal_acceptance_remaining:formal.pending_criteria_count,
    release_authorized:false,
    preflight_status:'blocked',
    blockers,
    note:'Immutable source and hash inventory is not a signed release, native device approval, rollback rehearsal or permission to sell. Never publish based on this output.',
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const root=process.cwd();
    const source=process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    const rollback=process.env.DENTALFLOW_ROLLBACK_CANDIDATE||null;
    const result=collectReleasePreflight(root,source,{rollbackCandidate:rollback});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch{
    console.error('BETA_RELEASE_PREFLIGHT_FAILED');process.exitCode=1;
  }
}
