import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publishNativeRelease,ReleaseNotFound} from './publish-native-release.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'dentalflow-native-publication-'));
const sha='a'.repeat(40);
const env={GITHUB_REPOSITORY:'GustavoFboz/dtfipo',GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/release/native-20261017',GITHUB_SHA:sha};
const digest=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
for(const dir of ['src-tauri','scripts','release','docs/releases']) fs.mkdirSync(path.join(root,dir),{recursive:true});
fs.writeFileSync(path.join(root,'src-tauri/tauri.conf.json'),JSON.stringify({version:'0.6.8'}));
fs.writeFileSync(path.join(root,'scripts/prepare-android-release.py'),'VERSION = "0.3.1"\n');
try {
  for(const [platform,base,extension,version] of [
    ['windows','DentalFlow_Windows_0.6.8_x64-setup','exe','0.6.8'],['android','DentalFlow_Android_0.3.1','apk','0.3.1'],
  ]) {
    const installer=`${base}.${extension}`,checksum=`${base}.sha256`,bytes=Buffer.from(`verified ${platform} artifact`);
    const sum=`${digest(bytes).slice(7)}  ${installer}\n`;
    fs.writeFileSync(path.join(root,'release',installer),bytes);fs.writeFileSync(path.join(root,'release',checksum),sum);
    fs.writeFileSync(path.join(root,`docs/releases/${platform}-${version}.md`),'Release notes');
    const execute=(state,overrides={})=>{
      const calls=[];const runGh=args=>{calls.push(args);if(args[0]==='api') {if(state==='missing') throw new ReleaseNotFound();return JSON.stringify(state);}return '';};
      return {calls,run:()=>publishNativeRelease(platform,{root,env:{...env,...overrides},runGh})};
    };
    let test=execute('missing');const result=test.run();
    assert.equal(result.sha256,digest(bytes));assert.equal(result.sourceCommit,sha);
    assert.deepEqual(test.calls.map(args=>args.slice(0,2)),[['api',`repos/GustavoFboz/dtfipo/releases/tags/${platform}-v${version}`],['release','create'],['release','upload'],['release','edit']]);
    assert(test.calls[1].includes('--draft'));assert(test.calls[1].includes(sha));
    assert(test.calls.every(args=>!args.includes('--clobber')));
    for(const overrides of [{GITHUB_REF:'refs/pull/1/merge'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/release/arbitrary'},{GITHUB_REPOSITORY:'external/fork'}]) {
      test=execute('missing',overrides);assert.throws(test.run,/Untrusted/);assert.equal(test.calls.length,0);
    }
    for(const state of [{draft:false,target_commitish:sha},{draft:true,target_commitish:'b'.repeat(40)}]) {
      test=execute(state);assert.throws(test.run,/Refusing/);assert.equal(test.calls.length,1);
    }
    test=execute({draft:true,target_commitish:sha,assets:[{name:installer,digest:digest(bytes)}]});test.run();
    assert.equal(test.calls.length,3);assert(test.calls[1].includes(path.join(root,'release',checksum)));assert(!test.calls[1].includes(path.join(root,'release',installer)));
    test=execute({draft:true,target_commitish:sha,assets:[{name:installer,digest:digest(bytes)},{name:checksum,digest:digest(Buffer.from(sum))}]});test.run();
    assert.deepEqual(test.calls.map(args=>args[0]),['api','release']);assert.equal(test.calls[1][1],'edit');
    test=execute({draft:true,target_commitish:sha,assets:[{name:installer,digest:'sha256:wrong'}]});assert.throws(test.run,/digest mismatch/);assert.equal(test.calls.length,1);
    fs.writeFileSync(path.join(root,'release',checksum),`${'0'.repeat(64)}  ${installer}\n`);
    test=execute('missing');assert.throws(test.run,/checksum mismatch/);assert.equal(test.calls.length,0);
    fs.writeFileSync(path.join(root,'release',checksum),sum);
  }
  console.log('Native publication: trusted refs, checksums, immutable public assets and same-source draft recovery passed.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
