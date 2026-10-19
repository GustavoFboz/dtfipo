import {beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {runFixtureStorage} from './fixture-storage.server';
import type {Job} from './fixture-acceptance.server';

const runtime=vi.hoisted(()=>({sessions:[] as any[],admin:{} as any}));
vi.mock('./fixture-sessions.server',()=>({withFixtureSessions:async (_job:unknown,run:any)=>run(runtime.sessions)}));
vi.mock('@/integrations/supabase/client.server',()=>({get supabaseAdmin(){return runtime.admin;}}));
const job:Job={id:'8a0cbd19-6b52-4db9-991b-66711337e61b',kind:'storage',fixtures:[
  {user_id:'ee083f63-1621-4b82-b7a4-fd13427c0b14',email:'dentalflow-acceptance-20261004-e0537565-4015-4ffe-a249-5da489824e6e@example.invalid',clinic_id:'081d3db4-1606-40f7-a878-19b51556317d'},
  {user_id:'24e7cdf9-457e-4af2-b1cb-cf366abbddb0',email:'dentalflow-acceptance-20261004-237e6ef4-9893-43d2-b9a3-311f8708aa3d@example.invalid',clinic_id:'3fc86c40-697e-4725-a9e9-633fc882aadc'},
]};
type Row=Record<string,any>;
function environment(options:{failUpload?:boolean;failDelete?:boolean;allowOverdraft?:boolean;allowSizeMismatch?:boolean;allowPrematureRelease?:boolean;ambiguousReservation?:boolean}={}) {
  const tables:Record<string,Row[]>={patients:[],cases:[],case_attachments:[],patient_attachments:[],
    profiles:job.fixtures.map(f=>({id:f.user_id,clinic_id:f.clinic_id,role:'USER',avatar_url:null}))};
  const reservations=new Map<string,Row>(),objects=new Map<string,{owner:string;bytes:Buffer}>();
  const adminCalls:Row[]=[],userCalls:Row[]=[];
  let ambiguityUsed=false;
  const result=(data:any,error:any=null)=>({data,error});
  const owns=(row:Row,table:string,actor:Job['fixtures'][number]):boolean=>{
    if(table==='profiles') return row.id===actor.user_id;
    // Ordinary participants cannot list the company storage catalog. Known
    // returned reservation IDs must suffice; hidden metadata is not proof of
    // absence after an ambiguous transport result.
    if(table==='storage_files') return false;
    if(table==='patients') return row.clinic_id===actor.clinic_id;
    if(table==='cases') return row.requested_by===actor.user_id;
    const parent=table==='case_attachments'?'cases':'patients';
    const id=table==='case_attachments'?row.case_id:row.patient_id;
    return tables[parent].some(p=>p.id===id&&owns(p,parent,actor));
  };
  function from(table:string,actor?:Job['fixtures'][number]) {
    if(!actor&&!['patients','cases'].includes(table)) throw new Error('Administrative scope exceeded');
    let operation='select',values:Row|undefined,single=false;const filters:Row={},lists:Record<string,any[]>={};
    const query:any={
      insert(row:Row){operation='insert';values=row;return query;},
      update(row:Row){operation='update';values=row;return query;},
      delete(){operation='delete';return query;},
      select(){return query;},eq(key:string,value:any){filters[key]=value;return query;},
      is(key:string,value:any){filters[key]=value;return query;},
      in(key:string,values:any[]){lists[key]=values;return query;},
      single(){single=true;return query;},
      then(resolve:any,reject:any){return Promise.resolve().then(()=>{
        (actor?userCalls:adminCalls).push({table,operation,filters:{...filters},values});
        if(actor&&['patients','cases'].includes(table)&&operation!=='select') return result(null,{message:'Clinical administration denied'});
        if(actor&&table==='profiles'&&values&&Object.keys(values).some(k=>k!=='avatar_url')) throw new Error('Profile privilege mutation');
        if(table==='storage_files') tables[table]=[...reservations.entries()].map(([id,row])=>({id,object_path:row._object_path,bucket:row._bucket,uploaded_by:row.owner,clinic_id:row.clinic_id,status:'reserved'}));
        const matches=(row:Row)=>Object.entries(filters).every(([k,v])=>row[k]===v)&&Object.entries(lists).every(([k,v])=>v.includes(row[k]))&&(!actor||owns(row,table,actor));
        let rows=tables[table].filter(matches);
        if(operation==='insert') {const row={id:randomUUID(),...values};tables[table].push(row);rows=[row];}
        if(operation==='update') rows.forEach(row=>Object.assign(row,values));
        if(operation==='delete') tables[table]=tables[table].filter(row=>!matches(row));
        return result(single?rows[0]:rows);
      }).then(resolve,reject);},
    };return query;
  }
  runtime.admin={from:(table:string)=>from(table)};
  runtime.sessions=job.fixtures.map(actor=>({...actor,client:{
    from:(table:string)=>from(table,actor),
    rpc:async (name:string,args:any={})=>{
      userCalls.push({rpc:name,actor:actor.user_id});
      if(name==='get_storage_usage') return result([{used_bytes:[...reservations.values()].filter(r=>r.owner===actor.user_id).reduce((n,r)=>n+r._size_bytes,0),limit_bytes:1000}]);
      if(name==='reserve_storage_upload') {
        const prefix=args._object_path.split('/')[0];
        const allowed=args._bucket==='avatars'?prefix===actor.user_id:
          [...tables.patients,...tables.cases].some(row=>row.id===prefix&&(row.clinic_id===actor.clinic_id||row.requested_by===actor.user_id));
        if(!allowed) return result(null,{message:'STORAGE_RESERVATION_NOT_ALLOWED'});
        const used=[...reservations.values()].filter(r=>r.owner===actor.user_id).reduce((n,r)=>n+r._size_bytes,0);
        if(args._size_bytes>1000||(!options.allowOverdraft&&used+args._size_bytes>1000)) return result(null,{message:'STORAGE_QUOTA_EXCEEDED'});
        const file_id=randomUUID();reservations.set(file_id,{...args,owner:actor.user_id,clinic_id:actor.clinic_id});
        if(options.ambiguousReservation&&!ambiguityUsed&&args._object_path.includes('-resilience-parallel-')) {
          ambiguityUsed=true;throw new Error('Response lost after committed fixture reservation');
        }
        return result([{file_id}]);
      }
      const reservation=reservations.get(args._file_id);
      if(!reservation&&name==='cancel_storage_upload') return result(null);
      if(!reservation||reservation.owner!==actor.user_id) return result(null,{message:'Unknown reservation'});
      const key=`${reservation._bucket}/${reservation._object_path}`;
      if(name==='complete_storage_upload') {
        if(!objects.has(key)) return result(null,{message:'STORAGE_OBJECT_SIZE_MISMATCH'});return result(null);
      }
      if(name==='cancel_storage_upload') {
        if(objects.has(key)&&!options.allowPrematureRelease) return result(null,{message:'STORAGE_OBJECT_STILL_EXISTS'});
        reservations.delete(args._file_id);return result(null);
      }
      throw new Error('Manager-only RPC called');
    },
    storage:{from:(bucket:string)=>({
      upload:async (path:string,bytes:Buffer)=>{
        userCalls.push({storage:'upload',bucket,actor:actor.user_id});
        if(options.failUpload||![...reservations.values()].some(r=>r.owner===actor.user_id&&r._bucket===bucket&&r._object_path===path&&(options.allowSizeMismatch||r._size_bytes===bytes.length))) return result(null,{message:'Upload denied'});
        objects.set(`${bucket}/${path}`,{owner:actor.user_id,bytes});return result({path});
      },
      download:async (path:string)=>{
        const object=objects.get(`${bucket}/${path}`);
        return object?.owner===actor.user_id?result(new Blob([new Uint8Array(object.bytes)])):result(null,{message:'Object unavailable'});
      },
      remove:async (paths:string[])=>{
        for(const path of paths) if(objects.get(`${bucket}/${path}`)?.owner===actor.user_id) {
          if(options.failDelete) return result(null,{message:'Storage unavailable'});
          objects.delete(`${bucket}/${path}`);
        }return result([]);
      },
    })},
  }}));
  return {tables,reservations,objects,adminCalls,userCalls};
}

describe('storage acceptance with unprivileged case participants',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('uses administration only for disposable clinical setup and cleanup, and users for all bytes and reservations',async()=>{
    const env=environment();const checks=await runFixtureStorage(job);
    expect(checks.filter(check=>check.check.endsWith('_real_upload_size'))).toHaveLength(8);
    expect(checks.every(check=>check.passed)).toBe(true);
    expect(env.adminCalls.every(call=>['patients','cases'].includes(call.table))).toBe(true);
    const inserts=env.adminCalls.filter(call=>call.operation==='insert');expect(inserts).toHaveLength(4);
    expect(inserts.filter(c=>c.table==='patients').every(c=>c.values.name.endsWith(job.id))).toBe(true);
    expect(inserts.filter(c=>c.table==='cases').every(c=>c.values.requested_by===null)).toBe(true);
    expect(env.adminCalls.filter(c=>c.table==='cases'&&c.operation==='update').every(c=>c.filters.requested_by===null&&c.filters.patient_id&&c.filters.id)).toBe(true);
    expect(env.adminCalls.filter(c=>c.operation==='delete').every(c=>c.filters.id)).toBe(true);
    expect(env.userCalls.some(c=>c.rpc==='delete_managed_storage_file')).toBe(false);
    expect(env.userCalls.filter(c=>c.storage==='upload')).toHaveLength(14);
    expect(checks.filter(c=>c.check==='parallel_quota_single_winner'&&c.passed)).toHaveLength(2);
    expect(checks.filter(c=>c.check==='resilience_quota_restored'&&c.passed)).toHaveLength(2);
    expect(env.tables.patients).toHaveLength(0);expect(env.tables.cases).toHaveLength(0);
    expect(env.tables.case_attachments).toHaveLength(0);expect(env.tables.patient_attachments).toHaveLength(0);
    expect(env.reservations.size).toBe(0);expect(env.objects.size).toBe(0);
    expect(env.tables.profiles.map(p=>[p.role,p.avatar_url])).toEqual([['USER',null],['USER',null]]);
  });
  it('releases the user reservation and removes only job records after an upload failure',async()=>{
    const env=environment({failUpload:true});const checks=await runFixtureStorage(job);
    expect(checks).toContainEqual({check:'storage_flow',passed:false,code:'FIXTURE_UPLOAD_FAILED'});
    expect(env.objects.size).toBe(0);expect(env.reservations.size).toBe(0);
    expect(env.tables.patients).toHaveLength(0);expect(env.tables.cases).toHaveLength(0);
  });
  it('keeps the case and patient when actual bytes could not be removed, instead of orphaning files',async()=>{
    const env=environment({failDelete:true});const checks=await runFixtureStorage(job);
    expect(checks.some(c=>!c.passed&&c.code==='FIXTURE_OBJECT_DELETE_FAILED')).toBe(true);
    expect(checks).toContainEqual({check:'storage_flow',passed:false,code:'FIXTURE_STORAGE_CLEANUP_INCOMPLETE'});
    expect(env.objects.size).toBe(4);expect(env.reservations.size).toBe(4);
    expect(env.tables.patients).toHaveLength(1);expect(env.tables.cases).toHaveLength(1);
    expect(env.adminCalls.some(c=>c.operation==='delete')).toBe(false);
  });
  it.each([
    [{allowOverdraft:true},'parallel_quota_single_winner'],
    [{allowSizeMismatch:true},'actual_size_mismatch_upload_denied'],
    [{allowPrematureRelease:true},'existing_bytes_prevent_quota_release'],
  ] as const)('refuses a broken reservation contract and cleans only its job paths (%j)',async(options,failedCheck)=>{
    const env=environment(options);const checks=await runFixtureStorage(job);
    expect(checks).toContainEqual(expect.objectContaining({check:failedCheck,passed:false}));
    expect(env.objects.size).toBe(0);expect(env.reservations.size).toBe(0);
    expect(env.tables.patients).toHaveLength(0);expect(env.tables.cases).toHaveLength(0);
    expect(env.adminCalls.every(call=>['patients','cases'].includes(call.table))).toBe(true);
  });
  it('reports an ambiguous committed reservation as unresolved when catalog RLS hides readback',async()=>{
    const env=environment({ambiguousReservation:true});const checks=await runFixtureStorage(job);
    expect(checks).toContainEqual({check:'storage_resilience_flow',passed:false,code:'FIXTURE_RESERVATION_TRANSPORT_AMBIGUOUS'});
    expect(checks).toContainEqual(expect.objectContaining({check:'resilience_quota_restored',passed:false}));
    expect(env.reservations.size).toBe(1);expect(env.objects.size).toBe(0);
    expect(env.adminCalls.every(call=>['patients','cases'].includes(call.table))).toBe(true);
  });
});
