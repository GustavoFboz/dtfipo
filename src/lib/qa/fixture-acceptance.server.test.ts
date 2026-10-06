import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { handleFixtureAcceptance, fixturePublicFetch } from './fixture-acceptance.server';

const id='8a0cbd19-6b52-4db9-991b-66711337e61b';
const token='a'.repeat(64);
const job={id,kind:'identity',fixtures:[
  {user_id:'ee083f63-1621-4b82-b7a4-fd13427c0b14',email:'dentalflow-acceptance-20261004-e0537565-4015-4ffe-a249-5da489824e6e@example.invalid',clinic_id:'081d3db4-1606-40f7-a878-19b51556317d'},
  {user_id:'24e7cdf9-457e-4af2-b1cb-cf366abbddb0',email:'dentalflow-acceptance-20261004-237e6ef4-9893-43d2-b9a3-311f8708aa3d@example.invalid',clinic_id:'3fc86c40-697e-4725-a9e9-633fc882aadc'},
]};
const request=(body:unknown={jobId:id},headers:Record<string,string>={},method='POST')=>new Request('https://dtfipo.lovable.app/api/qa/fixture-acceptance',{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
function dependencies(){return {claim:vi.fn().mockResolvedValue(job),finish:vi.fn().mockResolvedValue(true),run:vi.fn().mockResolvedValue([{check:'actual_flow',passed:true}])};}
describe('private fixture acceptance boundary',()=>{
  it('sends a new opaque public key only as apikey and preserves real user bearers',async()=>{
    const key='sb_publishable_fake_fixture_key';const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    const fetcher=fixturePublicFetch(key,transport);
    await fetcher('https://fixture.supabase.invalid/auth/v1/verify',{headers:{authorization:`Bearer ${key}`}});
    const first=transport.mock.calls[0][1]!;expect(new Headers(first.headers).get('authorization')).toBeNull();expect(new Headers(first.headers).get('apikey')).toBe(key);
    await fetcher('https://fixture.supabase.invalid/auth/v1/user',{headers:{authorization:'Bearer actual.fixture.jwt'}});
    expect(new Headers(transport.mock.calls[1][1]?.headers).get('authorization')).toBe('Bearer actual.fixture.jwt');
    expect(transport.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it('requires a dedicated capability before even loading administration',async()=>{
    const d=dependencies(); const r=await handleFixtureAcceptance(request({}, {authorization:'Bearer financial-worker-credential'}),d);
    expect(r.status).toBe(403);expect(d.claim).not.toHaveBeenCalled();expect(d.run).not.toHaveBeenCalled();
  });
  it('denies requests originating in a browser',async()=>{
    const d=dependencies(); expect((await handleFixtureAcceptance(request(undefined,{origin:'https://dtfipo.lovable.app'}),d)).status).toBe(403);expect(d.claim).not.toHaveBeenCalled();
  });
  it.each([{jobId:id,email:'real@example.com'},{jobId:id,kind:'billing'},{jobId:id,userId:job.fixtures[0].user_id},{jobId:'invalid'}])('never accepts identity or operation selectors: %j',async body=>{
    const d=dependencies();expect((await handleFixtureAcceptance(request(body),d)).status).toBe(400);expect(d.claim).not.toHaveBeenCalled();
  });
  it('hashes the capability and never returns it',async()=>{
    const d=dependencies();const r=await handleFixtureAcceptance(request(),d);
    expect(d.claim).toHaveBeenCalledWith(id,createHash('sha256').update(token).digest('hex'));expect(d.run).toHaveBeenCalledExactlyOnceWith(job);
    expect(r.status).toBe(200);const body=await r.text();expect(body).not.toContain(token);expect(body).not.toContain('@');
  });
  it.each([
    {...job,id:'be819fd7-c5bf-49f0-93e0-6f647f0b9c27'},
    {...job,fixtures:[{...job.fixtures[0],user_id:'be819fd7-c5bf-49f0-93e0-6f647f0b9c27'},job.fixtures[1]]},
    {...job,fixtures:[{...job.fixtures[0],email:'fixture@example.invalid'},job.fixtures[1]]},
    {...job,fixtures:[{...job.fixtures[0],clinic_id:job.fixtures[1].clinic_id},job.fixtures[1]]},
    {...job,fixtures:[job.fixtures[0],job.fixtures[0]]},
  ])('denies a replaced or duplicate fixture returned by the backend',async value=>{
    const d=dependencies();d.claim.mockResolvedValue(value);expect((await handleFixtureAcceptance(request(),d)).status).toBe(403);expect(d.run).not.toHaveBeenCalled();
  });
  it('does not rerun an expired or consumed capability',async()=>{
    const d=dependencies();d.claim.mockRejectedValue(new Error('consumed'));expect((await handleFixtureAcceptance(request(),d)).status).toBe(403);expect(d.run).not.toHaveBeenCalled();
  });
  it('persists failed checks as failures',async()=>{
    const d=dependencies();d.run.mockResolvedValue([{check:'recovery',passed:false}]);const r=await handleFixtureAcceptance(request(),d);
    expect(r.status).toBe(200);expect(d.finish.mock.calls[0][1].passed).toBe(false);
  });
  it('does not declare success if storing the receipt fails',async()=>{
    const d=dependencies();d.finish.mockResolvedValue(false);const r=await handleFixtureAcceptance(request(),d);
    expect(r.status).toBe(503);expect(await r.json()).toEqual({available:false,code:'FIXTURE_RECEIPT_NOT_PERSISTED'});
  });
  it('redacts unexpected exception details',async()=>{
    const d=dependencies();d.run.mockRejectedValue(new Error('Bearer token with personal information'));const r=await handleFixtureAcceptance(request(),d);
    expect(await r.text()).not.toContain('personal information');expect(d.finish.mock.calls[0][1].checks[0].code).toBe('FIXTURE_EXECUTION_FAILED');
  });
});
