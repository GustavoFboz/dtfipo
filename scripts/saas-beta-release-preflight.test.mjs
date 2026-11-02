import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,cpSync,rmSync,mkdtempSync,mkdirSync,readdirSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {collectReleasePreflight} from './saas-beta-release-preflight.mjs';

const root=process.cwd(),src='a'.repeat(40),rollback='b'.repeat(40);
test('current source yields a reproducible blocked release inventory, not a beta deployment',()=>{
 const a=collectReleasePreflight(root,src),b=collectReleasePreflight(root,src);
 assert.deepEqual(a,b);
 assert.equal(a.schema,'dentalflow-saas-beta-release-preflight-v1');
 assert.equal(a.platform_versions.windows,'0.6.8');
 assert.equal(a.platform_versions.android,'0.3.1');
 assert.equal(a.beta_implementation_percent,93.84);
 assert.equal(a.preflight_status,'blocked');
 assert.equal(a.release_authorized,false);
 assert.equal(a.formal_acceptance_remaining,10);
 assert(a.migrations.count>100);
 assert.match(a.migrations.manifest_sha256,/^[a-f0-9]{64}$/);
 assert(a.blockers.includes('historical_backup_incomplete'));
 assert(a.blockers.includes('native_artifacts_not_collected'));
 assert(a.blockers.includes('approved_terms_and_privacy_missing'));
 assert(a.blockers.includes('production_rollback_not_verified'));
 assert(a.blockers.includes('signed_native_artifacts_not_verified'));
 assert(a.blockers.includes('engineering_incomplete'));
 assert.equal(a.code_files.length,9);
 assert(a.code_files.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
 assert.equal(a.native_artifacts.length,0);
});
test('cannot invent approvals, use malformed commits or forge a rollback target',()=>{
 for(const bad of ['', 'abc','A'.repeat(40),'0'.repeat(39)]){
   assert.throws(()=>collectReleasePreflight(root,bad),/RELEASE_SOURCE_COMMIT_INVALID/);
 }
 assert.throws(()=>collectReleasePreflight(root,src,{rollbackCandidate:src}),/RELEASE_ROLLBACK_CANDIDATE_INVALID/);
 assert.throws(()=>collectReleasePreflight(root,src,{rollbackCandidate:'!'}),/RELEASE_ROLLBACK_CANDIDATE_INVALID/);
 assert.throws(()=>collectReleasePreflight(root,src,{approvals:{legal:true,release_authorized:true}}),/RELEASE_APPROVAL_CANNOT_BE_INJECTED/);
 assert.throws(()=>collectReleasePreflight(root,src,{nativeArtifacts:[{platform:'windows',path:'../secrets.env'}]}),/RELEASE_ARTIFACTS_INVALID/);
});
test('candidate SHA alone is never verified rollback or production approval',()=>{
 const r=collectReleasePreflight(root,src,{rollbackCandidate:rollback});
 assert.equal(r.rollback_candidate_commit,rollback);
 assert.equal(r.release_authorized,false);
 assert(r.blockers.includes('production_rollback_not_verified'));
 assert(!r.blockers.includes('rollback_source_not_selected'));
});
test('tampered Windows release metadata or Android package fails before artifact publication',()=>{
 const temp=mkdtempSync(path.join(os.tmpdir(),'df-release-preflight-'));
 try{
   for(const f of ['src-tauri/tauri.conf.json','src-tauri/Cargo.toml',
    'scripts/prepare-android-release.py','capacitor.config.ts']){
    mkdirSync(path.dirname(path.join(temp,f)),{recursive:true});
    cpSync(path.join(root,f),path.join(temp,f));
   }
   const config=JSON.parse(readFileSync(path.join(temp,'src-tauri/tauri.conf.json'),'utf8'));
   config.version='0.6.9';writeFileSync(path.join(temp,'src-tauri/tauri.conf.json'),JSON.stringify(config));
   assert.throws(()=>collectReleasePreflight(temp,src),/RELEASE_NATIVE_VERSION_MISMATCH/);
   config.version='0.6.8';writeFileSync(path.join(temp,'src-tauri/tauri.conf.json'),JSON.stringify(config));
   const cap=readFileSync(path.join(temp,'capacitor.config.ts'),'utf8').replace('br.com.dentalflow.mobile','br.com.fake.client');
   writeFileSync(path.join(temp,'capacitor.config.ts'),cap);
   assert.throws(()=>collectReleasePreflight(temp,src),/RELEASE_ANDROID_PACKAGE_MISMATCH/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('source migration manifest lists all SQL migrations, lexicographically',()=>{
 const sqlPaths=readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();
 const r=collectReleasePreflight(root,src);
 assert.equal(r.migrations.count,sqlPaths.length);
 assert.equal(r.migrations.last_sql,sqlPaths.at(-1));
});
