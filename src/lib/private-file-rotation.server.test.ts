import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {assertRotationTarget,executePrivateFileRotation,handlePrivateFileRotation,rotatePrivateTarget,type RotationTarget} from './private-file-rotation.server';
const subject='11111111-1111-4111-8111-111111111111';
const target:RotationTarget={id:'22222222-2222-4222-8222-222222222222',bucket:'avatars',subject_id:subject,
 old_path:subject+'/old.png',new_path:subject+'/new.png',old_signed_url:`https://project.supabase.co/storage/v1/object/sign/avatars/${subject}/old.png?token=legacy`,
 size_bytes:3,status:'prepared',content_hash:null};
const source={bytes:new Uint8Array([1,2,3]),mime:'image/png'};
const hash=createHash('sha256').update(source.bytes).digest('hex');
function operations(){
 let copied=false,removed=false;
 return {origin:'https://project.supabase.co',read:vi.fn(async(_bucket:string,path:string)=>path===target.new_path?(copied?source:null):(removed?null:source)),
  upload:vi.fn(async()=>{copied=true;}),activate:vi.fn(async()=>{}),remove:vi.fn(async()=>{removed=true;}),
  oldStatus:vi.fn(async():Promise<number>=>removed?404:200),verify:vi.fn(async()=>{}),pause:vi.fn(async()=>{})};
}
describe('private file rotation',()=>{
 it('verifies a copied file before switching references and retiring the issued URL',async()=>{
  const ops=operations();await rotatePrivateTarget(target,ops);
  expect(ops.activate).toHaveBeenCalledWith(target,hash);
  expect(ops.remove.mock.invocationCallOrder[0]).toBeGreaterThan(ops.activate.mock.invocationCallOrder[0]);
  expect(ops.verify).toHaveBeenCalledWith(target,hash,404);
 });
 it('reads back an upload whose response was lost, without a second upload',async()=>{
  const ops=operations(),upload=ops.upload.getMockImplementation()!;
  ops.upload.mockImplementation(async()=>{await upload();throw new Error('connection lost');});
  await rotatePrivateTarget(target,ops);expect(ops.upload).toHaveBeenCalledTimes(1);expect(ops.verify).toHaveBeenCalledTimes(1);
 });
 it('preserves the source and reference if the copy has different bytes',async()=>{
  const ops=operations();ops.read.mockImplementation(async(_b,path)=>path===target.new_path?{...source,bytes:new Uint8Array([3,2,1])}:source);
  await expect(rotatePrivateTarget(target,ops)).rejects.toThrow('ROTATION_COPY_UNVERIFIED');
  expect(ops.activate).not.toHaveBeenCalled();expect(ops.remove).not.toHaveBeenCalled();
 });
 it('preserves the original when the database rejects a concurrent reference change',async()=>{
  const ops=operations();ops.activate.mockRejectedValue(new Error('changed'));
  await expect(rotatePrivateTarget(target,ops)).rejects.toThrow('changed');expect(ops.remove).not.toHaveBeenCalled();
 });
 it('resumes an activated copy by its stored hash without another upload',async()=>{
  const ops=operations();ops.read.mockResolvedValue(source);
  await rotatePrivateTarget({...target,status:'activated',content_hash:hash},ops);
  expect(ops.upload).not.toHaveBeenCalled();expect(ops.verify).toHaveBeenCalledWith(expect.anything(),hash,404);
 });
 it('does not mark a cached, still-usable original URL as revoked',async()=>{
  const ops=operations();ops.oldStatus.mockResolvedValue(200);
  await expect(rotatePrivateTarget(target,ops)).rejects.toThrow('ROTATION_OLD_URL_STILL_USABLE');
  expect(ops.pause).toHaveBeenCalledTimes(4);expect(ops.verify).not.toHaveBeenCalled();
 });
 it('also retires an already-expired bearer while preserving the verified object',async()=>{
  const ops=operations();ops.oldStatus.mockResolvedValueOnce(400).mockResolvedValueOnce(404);
  await rotatePrivateTarget(target,ops);expect(ops.verify).toHaveBeenCalledWith(target,hash,404);
 });
 it('preserves the source if its original URL has an inconclusive server error',async()=>{
  const ops=operations();ops.oldStatus.mockResolvedValue(503);
  await expect(rotatePrivateTarget(target,ops)).rejects.toThrow('ROTATION_ORIGINAL_URL_UNVERIFIED');
  expect(ops.upload).not.toHaveBeenCalled();expect(ops.remove).not.toHaveBeenCalled();
 });
 it.each([
  {...target,old_signed_url:target.old_signed_url.replace('project.supabase.co','other.invalid')},
  {...target,new_path:'another-user/new.png'},
  {...target,new_path:subject+'/../new.png'},
 ])('rejects another origin, owner or traversal path before touching bytes',async bad=>{
  expect(()=>assertRotationTarget(bad,'https://project.supabase.co')).toThrow('ROTATION_TARGET_INVALID');
 });
 it('requires a capability and refuses browser-origin requests before loading admin access',async()=>{
  expect((await handlePrivateFileRotation(new Request('https://app.invalid',{method:'POST'}))).status).toBe(403);
  expect((await handlePrivateFileRotation(new Request('https://app.invalid',{method:'POST',headers:{Origin:'https://app.invalid',Authorization:'Bearer '+'a'.repeat(64)}}))).status).toBe(403);
 });
});

describe('maintenance request budget',()=>{
 const second:RotationTarget={...target,id:'33333333-3333-4333-8333-333333333333',
  old_path:subject+'/second-old.png',new_path:subject+'/second-new.png',
  old_signed_url:target.old_signed_url.replace('old.png','second-old.png')};
 const claim={id:'44444444-4444-4444-8444-444444444444',
  lease_token:'55555555-5555-4555-8555-555555555555',targets:[target,second]};
 function storageAdmin(failFirst=false){
  const objects=new Map([[target.old_path,source],[second.old_path,source]]);
  const reads:string[]=[];
  const storage={
   download:vi.fn(async(path:string)=>{
    reads.push(path);
    // Yield to reveal concurrent file work, rather than synchronously hiding it.
    await Promise.resolve();
    if(failFirst&&path===target.new_path)return {error:{statusCode:503,message:'unavailable'}};
    const object=objects.get(path);
    return object?{data:new Blob([object.bytes],{type:object.mime}),error:null}
     :{error:{statusCode:404,message:'not found'}};
   }),
   upload:vi.fn(async(path:string,bytes:Uint8Array,options:{contentType:string})=>{
    objects.set(path,{bytes:new Uint8Array(bytes),mime:options.contentType});return {error:null};
   }),
   remove:vi.fn(async(paths:string[])=>{paths.forEach(path=>objects.delete(path));return {error:null};}),
  };
  const rpc=vi.fn(async(name:string)=>({error:null,data:name==='finish_private_file_rotation'
   ?{passed:!failFirst,total:2,verified:failFirst?0:2}:true}));
  return {admin:{storage:{from:()=>storage},rpc},reads,objects,storage};
 }
 it('finishes every operation for one file before requesting another',async()=>{
  const test=storageAdmin();
  vi.stubEnv('SUPABASE_URL','https://project.supabase.co');
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(null,{status:
   test.objects.has(url.includes('second-old.png')?second.old_path:target.old_path)?200:404})));
  try{
   const result=await executePrivateFileRotation(claim,test.admin);
   expect(result.failures).toEqual([]);
   const firstSecondRead=test.reads.findIndex(path=>path===second.new_path||path===second.old_path);
   expect(firstSecondRead).toBeGreaterThan(0);
   expect(test.reads.slice(firstSecondRead)).not.toContain(target.new_path);
   expect(test.reads.slice(firstSecondRead)).not.toContain(target.old_path);
   expect(test.admin.rpc.mock.calls.filter(([name])=>name==='verify_private_file_rotation')).toHaveLength(2);
  }finally{vi.unstubAllGlobals();vi.unstubAllEnvs();}
 });
 it('stops after a failed read and preserves every later file without more requests',async()=>{
  const test=storageAdmin(true);
  vi.stubEnv('SUPABASE_URL','https://project.supabase.co');
  try{
   const result=await executePrivateFileRotation(claim,test.admin);
   expect(result.failures).toEqual([{id:target.id,code:'ROTATION_OBJECT_READ_FAILED'}]);
   expect(test.reads).toEqual([target.new_path]);
   expect(test.storage.upload).not.toHaveBeenCalled();
   expect(test.storage.remove).not.toHaveBeenCalled();
   expect(test.objects.has(second.old_path)).toBe(true);
   expect(test.admin.rpc).toHaveBeenCalledExactlyOnceWith('finish_private_file_rotation',{
    _job:claim.id,_lease:claim.lease_token});
  }finally{vi.unstubAllEnvs();}
 });
});
