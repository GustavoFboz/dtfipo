import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/billing/asaas-plan-change')({server:{handlers:{
 POST:async({request}:{request:Request})=>(await import('@/lib/billing/asaas-plan-change.server')).handleAsaasPlanChange(request),
 OPTIONS:async({request}:{request:Request})=>(await import('@/lib/billing/asaas-plan-change.server')).handleAsaasPlanChange(request),
}}});
