import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(()=>({ rpc:vi.fn() }));
vi.mock('@/integrations/supabase/client',()=>({ supabase:{ rpc } }));
import { createCaseConfirmed, createPatientConfirmed } from './creation-rpc';

describe('clinical creation confirmation',()=>{
 beforeEach(()=>rpc.mockReset());
 it('keeps a server error fatal and never sends a legacy insert on a missing RPC',async()=>{
  rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'missing'}});
  await expect(createCaseConfirmed({patient_id:'patient'},'same-attempt')).rejects.toThrow('atualização autorizada');
  expect(rpc).toHaveBeenCalledTimes(1);
 });
 it('retains the supplied patient ID and retry key',async()=>{
  rpc.mockResolvedValue({data:{id:'patient-id'},error:null});
  await expect(createPatientConfirmed({name:'Patient'},'attempt-id','patient-id')).resolves.toEqual({id:'patient-id'});
  expect(rpc).toHaveBeenCalledWith('create_patient_idempotent_v1',{_key:'attempt-id',_id:'patient-id',_values:{name:'Patient'}});
 });
 it.each([
  ['PATIENT_NAME_MATCH','CPF, RG ou telefone'],
  ['CREATION_KEY_CONFLICT','outros dados'],
  ['CREATION_RESULT_UNAVAILABLE','acesso mudou'],
 ])('explains %s without treating a failed request as success',async(message,expected)=>{
  rpc.mockResolvedValue({data:null,error:{message}});
  await expect(createCaseConfirmed({},'attempt')).rejects.toThrow(expected);
 });
 it('requires a nonempty server confirmation',async()=>{
  rpc.mockResolvedValue({data:null,error:null});
  await expect(createCaseConfirmed({},'attempt')).rejects.toThrow('não confirmou');
 });
});
