import {describe,it,expect,vi} from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {getCaseWorkflowStages,getActiveStages,workflowCompanyStages,type WorkflowStageV2} from './workflow-v2';
const stage=(id:string,company:string,key:string,position:number,version=1):WorkflowStageV2=>({id,clinic_id:company,name:key,
 color:null,position,phase_id:null,flow_key:'common',workflow_version:version,stage_key:key});
const rows=[stage('b1','B','entry',10),stage('b2','B','cad',20),stage('a1','A','entry',10),stage('a2','A','cad',20),stage('a3','A','entry',10,2)];
describe('company-owned workflow sequence',()=>{
 it('uses the current case company even if another company sorts first',()=>{
  expect(getCaseWorkflowStages(rows,{current_stage_id:'a1',workflow_key:'common',workflow_version:1}).map(s=>s.id)).toEqual(['a1','a2']);
 });
 it('preserves the historical case version after another version is published',()=>{
  expect(getCaseWorkflowStages(rows,{current_stage_id:'a2',workflow_key:'common',workflow_version:1}).map(s=>s.id)).toEqual(['a1','a2']);
 });
 it('resolves explicitly shared cases from their actual company',()=>{
  expect(getCaseWorkflowStages(rows,{current_stage_id:'b1',workflow_key:'common',workflow_version:1}).map(s=>s.id)).toEqual(['b1','b2']);
 });
 it('hides ambiguous unassigned sequences',()=>{
  expect(workflowCompanyStages(rows,null)).toEqual([]);
  expect(getCaseWorkflowStages(rows,{workflow_key:'common',workflow_version:1})).toEqual([]);
 });
 it('edits only the company of the selected active template',()=>{
  expect(getActiveStages(rows,[{clinic_id:'A',flow_key:'common',name:'common',active_version:2,updated_at:''}],'common').map(s=>s.id)).toEqual(['a3']);
 });
});
