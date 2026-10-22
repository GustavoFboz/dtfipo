import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({user:'a',clinic:'one',deviceUser:'a',cacheGet:vi.fn(),cachePut:vi.fn(),queue:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:state.user}}}})}}}));
vi.mock('./desktop-local',()=>({getProvisionedDesktopIdentity:async()=>state.clinic?{user_id:state.deviceUser,clinic_id:state.clinic}:null,
 localCacheGet:(...args:unknown[])=>state.cacheGet(...args),localCachePut:(...args:unknown[])=>state.cachePut(...args),enqueueOutbox:(...args:unknown[])=>state.queue(...args)}));
import {stockCompanyScope,companyStockCacheGet,companyStockCachePut,enqueueCompanyStock,companyStockPayload} from './stock-company-local';
describe('stock ownership in installed clients',()=>{
 beforeEach(()=>{vi.clearAllMocks();Object.assign(state,{user:'a',clinic:'one',deviceUser:'a'});state.cacheGet.mockResolvedValue({payload:[]});});
 it('uses company and user namespaces with no legacy cache fallback',async()=>{
  const first=await stockCompanyScope();await companyStockCacheGet(first,'stock-items:v1','all');
  expect(state.cacheGet).toHaveBeenCalledWith('a','stock-items:v1:company-v1:one','all');
  state.clinic='two';const second=await stockCompanyScope();await companyStockCacheGet(second,'stock-items:v1','all');
  expect(state.cacheGet).toHaveBeenLastCalledWith('a','stock-items:v1:company-v1:two','all');expect(state.cacheGet).toHaveBeenCalledTimes(2);
 });
 it('refuses mismatched and expired device identities',async()=>{
  state.deviceUser='b';await expect(stockCompanyScope()).rejects.toThrow();state.deviceUser='a';state.clinic='';await expect(stockCompanyScope()).rejects.toThrow();
 });
 it('rejects a response arriving after a company switch',async()=>{
  const scope=await stockCompanyScope();state.clinic='two';
  await expect(companyStockCachePut(scope,'items','all',[{id:'old'}])).rejects.toThrow();expect(state.cachePut).not.toHaveBeenCalled();
 });
 it('does not return local data when the account changes during a read',async()=>{
  const scope=await stockCompanyScope();state.cacheGet.mockImplementationOnce(async()=>{state.user='b';return {payload:['private']};});
  await expect(companyStockCacheGet(scope,'items','all')).rejects.toThrow();
 });
 it('retains a company marker in pending writes and removes it from API payloads',async()=>{
  const scope=await stockCompanyScope();await enqueueCompanyStock({scope,entityType:'stock_items',entityId:'id',operation:'create',payload:{id:'id'}});
  expect(state.queue).toHaveBeenCalledWith(expect.objectContaining({ownerId:'a',payload:{id:'id',__dentalflow_company_id:'one'}}));
  expect(await companyStockPayload(scope,{id:'id',__dentalflow_company_id:'one'})).toEqual({id:'id'});
 });
 it('refuses pending writes from another company or from before ownership tracking',async()=>{
  const scope=await stockCompanyScope();await expect(companyStockPayload(scope,{id:'legacy'})).rejects.toThrow();
  await expect(companyStockPayload(scope,{__dentalflow_company_id:'two'})).rejects.toThrow();expect(state.queue).not.toHaveBeenCalled();
 });
});
