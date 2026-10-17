import {describe,it,expect} from 'vitest';
import {handleAsaasCheckoutOptions,handleAsaasCheckoutRequest} from './asaas-checkout.server';
import {handleAsaasRenewalRequest} from './asaas-renewal.server';
import {handleAsaasDocumentRequest} from './asaas-document.server';
import {handleAsaasCancelRequest} from './asaas-cancel.server';

const handlers=[
  ['checkout',handleAsaasCheckoutOptions],['renewal',handleAsaasRenewalRequest],
  ['document',handleAsaasDocumentRequest],['cancel',handleAsaasCancelRequest],
] as const;
const origins=['http://tauri.localhost','https://tauri.localhost','https://localhost','tauri://localhost','capacitor://localhost'];
const untrusted=['https://localhost.evil.example','http://tauri.localhost.evil.example','https://example.com',
  'https://localhost:8443','https://user@localhost','tauri://user@localhost','capacitor://localhost/path','null'];
describe.each(handlers)('native %s CORS boundary',(_name,handle)=>{
  it.each(origins)('permits preflight from the exact installed origin %s',async origin=>{
    const response=await handle(new Request('https://dtfipo.lovable.app/api/billing/fixture',{
      method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type'},
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-headers')).toBe('authorization, content-type');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(response.headers.get('vary')).toBe('Origin');
  });
  it.each(untrusted)('denies a lookalike or non-canonical origin %s',async origin=>{
    const response=await handle(new Request('https://dtfipo.lovable.app/api/billing/fixture',{method:'OPTIONS',headers:{origin}}));
    expect(response.status).toBe(403);expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
describe('native origins still require a real authenticated billing session',()=>{
  it.each(origins)('refuses checkout without a bearer from %s',async origin=>{
    const response=await handleAsaasCheckoutRequest(new Request('https://dtfipo.lovable.app/api/billing/asaas-checkout',{
      method:'POST',headers:{origin,'content-type':'application/json'},
      body:JSON.stringify({checkoutIntentId:'85c18580-3fa7-4fb0-8101-e0625f1fd875'}),
    }));
    expect(response.status).toBe(403);expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect((await response.json()).code).toBe('BILLING_CHECKOUT_FORBIDDEN');
  });
});
