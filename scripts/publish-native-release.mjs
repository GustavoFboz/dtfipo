import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export class ReleaseNotFound extends Error {}
const repository='GustavoFboz/dtfipo';
const releaseRef='refs/heads/release/native-20261017';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function gh(args) {
  try {return execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
  catch(error) {
    if(args[0]==='api'&&/\(HTTP 404\)/.test(String(error.stderr))) throw new ReleaseNotFound();
    throw new Error('GitHub could not confirm the release operation. Inspect the workflow before retrying.');
  }
}

/** Publish only verified artifacts from an explicit trusted source. Existing
 * public assets are immutable; incomplete drafts can resume only with matching
 * source SHA and matching SHA-256 digests of every artifact already present. */
export function publishNativeRelease(platform,{root=process.cwd(),env=process.env,runGh=gh}={}) {
  if(!['windows','android'].includes(platform)||env.GITHUB_REPOSITORY!==repository
    ||!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
    ||!['refs/heads/main',releaseRef].includes(env.GITHUB_REF)
    ||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')) throw new Error('Untrusted native publication context.');
  const version=platform==='windows'
    ? JSON.parse(fs.readFileSync(path.join(root,'src-tauri/tauri.conf.json'),'utf8')).version
    : fs.readFileSync(path.join(root,'scripts/prepare-android-release.py'),'utf8').match(/^VERSION = "([^"]+)"/m)?.[1];
  if(!/^\d+\.\d+\.\d+$/.test(version??'')) throw new Error('Invalid native release version.');
  const base=platform==='windows'?`DentalFlow_Windows_${version}_x64-setup`:`DentalFlow_Android_${version}`;
  const installer=`${base}.${platform==='windows'?'exe':'apk'}`;
  const checksum=`${base}.sha256`;
  const files=[installer,checksum].map(name=>({name,file:path.join(root,'release',name)}));
  for(const file of files) {
    const bytes=fs.readFileSync(file.file);if(!bytes.length) throw new Error('Empty native release artifact.');
    file.digest=`sha256:${hash(bytes)}`;
  }
  const proof=fs.readFileSync(files[1].file,'utf8').trim().match(/^([a-f0-9]{64})\s+\*?(\S+)$/i);
  if(!proof||proof[2]!==installer||`sha256:${proof[1].toLowerCase()}`!==files[0].digest)
    throw new Error('Native installer checksum mismatch.');
  const notes=path.join(root,`docs/releases/${platform}-${version}.md`);
  if(!fs.readFileSync(notes,'utf8').trim()) throw new Error('Native release notes are missing.');
  const tag=`${platform}-v${version}`;
  let existing;
  try {existing=JSON.parse(runGh(['api',`repos/${repository}/releases/tags/${tag}`]));}
  catch(error) {if(!(error instanceof ReleaseNotFound)) throw error;}
  if(existing) {
    if(existing.draft!==true||existing.target_commitish!==env.GITHUB_SHA)
      throw new Error('Refusing to replace a published release or a draft from another source commit.');
    for(const file of files) {
      const asset=existing.assets?.find(asset=>asset.name===file.name);
      if(asset&&asset.digest!==file.digest) throw new Error('Existing draft artifact digest mismatch.');
    }
  } else {
    runGh(['release','create',tag,'--repo',repository,'--target',env.GITHUB_SHA,
      '--title',`DentalFlow ${platform==='windows'?'Windows':'Android'} ${version}`,'--notes-file',notes,'--draft']);
  }
  const missing=files.filter(file=>!existing?.assets?.some(asset=>asset.name===file.name));
  if(missing.length) runGh(['release','upload',tag,...missing.map(file=>file.file),'--repo',repository]);
  runGh(['release','edit',tag,'--repo',repository,'--draft=false']);
  return {platform,version,tag,sourceCommit:env.GITHUB_SHA,installer,sha256:files[0].digest};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(publishNativeRelease(process.argv[2])));}
  catch(error) {console.error(error.message);process.exitCode=1;}
}
