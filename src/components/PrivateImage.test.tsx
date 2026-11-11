// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({invalidate:vi.fn(),resolve:vi.fn()}));
vi.mock('@/lib/private-file-access',()=>({invalidatePrivateFileReference:mocks.invalidate}));
vi.mock('@/hooks/use-private-file-url',()=>({usePrivateFileUrl:(src:string,retry:number)=>mocks.resolve(src,retry)}));
vi.mock('@/components/ui/avatar',()=>({AvatarImage:({src,onLoadingStatusChange}:any)=><img src={src} onError={()=>onLoadingStatusChange?.('error')}/>}));
import {PrivateAvatarImage,PrivateImage} from './PrivateImage';
let root:Root;let container:HTMLDivElement;
beforeEach(()=>{
 vi.clearAllMocks();mocks.invalidate.mockReturnValue(true);
 mocks.resolve.mockImplementation((_src,retry)=>`https://fixture.invalid/${retry?'renewed':'cached'}.png`);
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 vi.stubGlobal('navigator',{onLine:true});container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
describe('private image recovery',()=>{
 it('re-signs once after a stale cached image fails, without an error loop',async()=>{
  const error=vi.fn();await act(async()=>root.render(<PrivateImage src="storage://avatars/owner/old.png" onError={error}/>));
  await act(async()=>container.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(container.querySelector('img')!.getAttribute('src')).toContain('renewed');
  expect(mocks.invalidate).toHaveBeenCalledWith('storage://avatars/owner/old.png');
  await act(async()=>container.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(mocks.invalidate).toHaveBeenCalledTimes(1);expect(error).toHaveBeenCalledTimes(1);
 });
 it('uses the same recovery contract for Radix avatars',async()=>{
  const status=vi.fn();await act(async()=>root.render(<PrivateAvatarImage src="storage://avatars/owner/old.png" onLoadingStatusChange={status}/>));
  await act(async()=>container.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(container.querySelector('img')!.getAttribute('src')).toContain('renewed');expect(status).not.toHaveBeenCalledWith('error');
  await act(async()=>container.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(status).toHaveBeenCalledWith('error');expect(mocks.invalidate).toHaveBeenCalledTimes(1);
 });
 it('keeps offline image failures local without requesting a new signature',async()=>{
  vi.stubGlobal('navigator',{onLine:false});await act(async()=>root.render(<PrivateImage src="storage://avatars/owner/old.png"/>));
  await act(async()=>container.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(mocks.invalidate).not.toHaveBeenCalled();
 });
});
