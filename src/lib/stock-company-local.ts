import {supabase} from '@/integrations/supabase/client';
import {getProvisionedDesktopIdentity, localCacheGet, localCachePut, enqueueOutbox} from './desktop-local';

export type StockCompanyScope = Readonly<{ownerId:string; clinicId:string}>;
export class StockCompanyScopeError extends Error {}

/** Local identity only. The existing device reader enforces the 72h limit. */
export async function stockCompanyScope():Promise<StockCompanyScope> {
  const device=await getProvisionedDesktopIdentity();
  if(!device?.clinic_id)
    throw new StockCompanyScopeError('Conecte-se para confirmar a empresa deste dispositivo.');
  // The finite-lived provision is the offline authorization. getSession can
  // attempt a token refresh, so an offline read must not depend on that call.
  if(typeof navigator==='undefined'||navigator.onLine!==false) {
    const {data}=await supabase.auth.getSession();
    if(device.user_id!==data.session?.user?.id)
      throw new StockCompanyScopeError('Conecte-se para confirmar a empresa deste dispositivo.');
  }
  return Object.freeze({ownerId:device.user_id,clinicId:device.clinic_id});
}
export async function assertStockCompany(scope:StockCompanyScope) {
  const current=await stockCompanyScope();
  if(current.ownerId!==scope.ownerId||current.clinicId!==scope.clinicId)
    throw new StockCompanyScopeError('A conta ou empresa mudou durante a operação. Atualize a sessão.');
}
const namespace=(scope:StockCompanyScope,name:string)=>`${name}:company-v1:${scope.clinicId}`;
export async function companyStockCacheGet<T>(scope:StockCompanyScope,name:string,key:string) {
  await assertStockCompany(scope);
  const value=await localCacheGet<T>(scope.ownerId,namespace(scope,name),key);
  await assertStockCompany(scope);
  return value;
}
export async function companyStockCachePut<T>(scope:StockCompanyScope,name:string,key:string,payload:T) {
  await assertStockCompany(scope);
  const result=await localCachePut(scope.ownerId,namespace(scope,name),key,payload);
  await assertStockCompany(scope);
  return result;
}
type QueueInput=Omit<Parameters<typeof enqueueOutbox>[0],'ownerId'|'payload'>&{scope:StockCompanyScope;payload:Record<string,unknown>};
export async function enqueueCompanyStock({scope,payload,...input}:QueueInput) {
  await assertStockCompany(scope);
  return enqueueOutbox({...input,ownerId:scope.ownerId,payload:{...payload,__dentalflow_company_id:scope.clinicId}});
}
export async function companyStockPayload(scope:StockCompanyScope,payload:Record<string,any>) {
  await assertStockCompany(scope);
  if(payload.__dentalflow_company_id!==scope.clinicId)
    throw new StockCompanyScopeError('Alteração pendente sem confirmação desta empresa. Revise antes de sincronizar.');
  const {__dentalflow_company_id:_,...data}=payload;
  return data;
}
