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
 it('fails closed when a referenced case stage is absent rather than selecting the only other company',()=>{
  const onlyB=rows.filter(s=>s.clinic_id==='B');
  expect(workflowCompanyStages(onlyB,'a1')).toEqual([]);
  expect(getCaseWorkflowStages(onlyB,{current_stage_id:'a1',workflow_key:'common',workflow_version:1})).toEqual([]);
 });
 it('fails closed when the selected stage has no company even if other rows are owned',()=>{
  const orphan=stage('orphan','', 'entry',5);
  const mixed=[orphan,...rows.filter(s=>s.clinic_id==='A')];
  expect(workflowCompanyStages(mixed,'orphan')).toEqual([]);
  expect(getCaseWorkflowStages(mixed,{current_stage_id:'orphan',workflow_key:'common',workflow_version:1})).toEqual([]);
 });
 it('excludes legacy unowned stages when only one verified company exists',()=>{
  const orphan=stage('orphan','', 'legacy',5);
  const a=rows.filter(s=>s.clinic_id==='A');
  expect(workflowCompanyStages([orphan,...a],null).map(s=>s.id)).toEqual(a.map(s=>s.id));
  expect(workflowCompanyStages([orphan],null)).toEqual([]);
 });
 it('keeps correct company stages when an orphan and foreign company are also present',()=>{
  const orphan=stage('orphan','', 'legacy',5);
  const visible=getCaseWorkflowStages([orphan,...rows],{current_stage_id:'b1',workflow_key:'common',workflow_version:1});
  expect(visible.map(s=>s.id)).toEqual(['b1','b2']);
 });

});
