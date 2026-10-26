import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/maintenance/private-file-rotation')({server:{handlers:{POST:async({request})=>{
 const {handlePrivateFileRotation}=await import('@/lib/private-file-rotation.server');
 return handlePrivateFileRotation(request);
}}}});
