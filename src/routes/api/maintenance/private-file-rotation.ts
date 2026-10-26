import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/maintenance/private-file-rotation')({server:{handlers:{
 GET:()=>Response.json({contract:'dentalflow-private-file-rotation-v1',readOnly:true,writeRequiresCapability:true},
  {headers:{'Cache-Control':'no-store'}}),
 POST:async({request})=>{
 const {handlePrivateFileRotation}=await import('@/lib/private-file-rotation.server');
 return handlePrivateFileRotation(request);
}}}});
