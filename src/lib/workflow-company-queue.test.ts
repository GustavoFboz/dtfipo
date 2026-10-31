import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({pending:vi.fn(),mark:vi.fn(),clear:vi.fn(),update:vi.fn(),put:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'user-a'}}}})}}}));
vi.mock('./desktop-local',()=>({isDentalFlowDesktop:()=>true,getProvisionedDesktopIdentity:async()=>({user_id:'user-a',clinic_id:'company-a'}),
 localCacheGet:async()=>null,localCachePut:m.put,enqueueOutbox:vi.fn(),getPendingOutbox:m.pending,markOutbox:m.mark,clearDoneOutbox:m.clear}));
vi.mock('./workflow',()=>({updateWorkflowSettings:m.update,fetchWorkflowSettings:async()=>({id:true}),fetchWorkflowStages:async()=>[],
 fetchAllStageAssignments:async()=>[],fetchReturnReasons:async()=>[]}));
vi.mock('./cases-local-first',()=>({fetchCasesLocalFirst:async()=>[]}));
import {syncPendingWorkflowChanges} from './workflow-local-first';
describe('workflow pending writes retain their originating company',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it.each([undefined,'company-b'])('preserves an ambiguous/foreign pending write as a conflict: %s',async company=>{
  m.pending.mockResolvedValue([{id:'pending-a',entity_type:'workflow',operation:'update_settings',payload:{patch:{progress_bar_enabled:false},...company?{__dentalflow_company_id:company}:{}}}]);
  const result=await syncPendingWorkflowChanges();
  expect(result).toMatchObject({processed:0,failed:0,conflicts:1});expect(m.update).not.toHaveBeenCalled();
  expect(m.mark).toHaveBeenCalledWith('user-a','pending-a','conflict',expect.any(String));
 });
 it('sends an owned settings change with an explicit company assertion',async()=>{
  m.pending.mockResolvedValue([{id:'pending-a',entity_type:'workflow',operation:'update_settings',payload:{patch:{progress_bar_enabled:false},__dentalflow_company_id:'company-a'}}]);
  expect(await syncPendingWorkflowChanges()).toMatchObject({processed:1,failed:0,conflicts:0});
  expect(m.update).toHaveBeenCalledExactlyOnceWith({progress_bar_enabled:false},'company-a');
 });
});
