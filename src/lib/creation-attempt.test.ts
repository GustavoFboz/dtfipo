import { describe, expect, it } from 'vitest';
import { clearCreationAttempt, loadCreationAttempt, singleFlight } from './creation-attempt';

describe('durable creation attempts', () => {
 it('keeps the same IDs through a failed request and reload, isolated by actor/company', () => {
  const values = new Map<string,string>();
  const storage = { getItem: (k:string)=>values.get(k) ?? null, setItem: (k:string,v:string)=>{values.set(k,v);}, removeItem:(k:string)=>{values.delete(k);} };
  const first = loadCreationAttempt(storage,'case:actor-a:clinic-a');
  expect(loadCreationAttempt(storage,'case:actor-a:clinic-a')).toEqual(first);
  expect(loadCreationAttempt(storage,'case:actor-b:clinic-b')).not.toEqual(first);
  clearCreationAttempt(storage,'case:actor-a:clinic-a');
  expect(loadCreationAttempt(storage,'case:actor-a:clinic-a')).not.toEqual(first);
 });
 it.each(['{','null','{"key":"bad","patientId":"bad"}'])('recovers from an invalid stored attempt: %s', raw => {
  const result = loadCreationAttempt({ getItem:()=>raw,setItem:()=>{} },'patient:a');
  expect(result.key).toMatch(/^[a-f0-9-]{36}$/);
 });
 it('shares a pending failure and permits a subsequent retry',async () => {
  const run = singleFlight<number>();
  let reject!:(reason:Error)=>void;
  const a=run(()=>new Promise((_resolve,r)=>{reject=r;}));
  const b=run(()=>Promise.resolve(99));
  expect(a).toBe(b);
  await Promise.resolve();
  reject(new Error('network lost'));
  await expect(a).rejects.toThrow('network lost');
  await expect(run(()=>Promise.resolve(42))).resolves.toBe(42);
 });
});
