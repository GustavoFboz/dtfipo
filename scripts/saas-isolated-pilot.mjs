/**
 * Strictly bounded capacity smoke for a *locally isolated* HTTP fixture.
 * No remote destination, no user JWT, no clinical record, no production load.
 * This measures only the supplied disposable loopback service.
 */
import {pathToFileURL} from "node:url";
import {performance} from "node:perf_hooks";

export class PilotUnsafeTarget extends Error {
  constructor(code){super(code);this.name="PilotUnsafeTarget";}
}
function configOf(options={}){
  let u;
  try{u=new URL(options.url);}catch{throw new PilotUnsafeTarget("PILOT_TARGET_INVALID");}
  if(u.protocol!=="http:"||u.hostname!=="127.0.0.1"||u.username||u.password
    ||!u.port||u.pathname!=="/health"||u.search||u.hash)throw new PilotUnsafeTarget("PILOT_TARGET_NOT_LOOPBACK");
  const count=options.count??20, concurrent=options.concurrency??2, timeoutMs=options.timeoutMs??2000;
  if(!Number.isInteger(count)||count<1||count>40||!Number.isInteger(concurrent)||concurrent<1||concurrent>4
    ||concurrent>count||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>3000)
    throw new PilotUnsafeTarget("PILOT_BUDGET_OUT_OF_RANGE");
  return {url:u.toString(),count,concurrent,timeoutMs,fetchImpl:options.fetchImpl??fetch};
}
const quantile=(sorted,q)=>sorted.length?Number(sorted[Math.ceil(q*sorted.length)-1].toFixed(2)):null;
export async function runIsolatedPilot(options={}){
  const {url,count,concurrent,timeoutMs,fetchImpl}=configOf(options);
  let cursor=0, active=0, maxActive=0, success=0, failed=0;
  const elapsed=[];
  const started=performance.now();
  async function worker(){
    while(true){
      const item=cursor++;
      if(item>=count)return;
      active++;maxActive=Math.max(maxActive,active);
      const start=performance.now();
      try{
        const res=await fetchImpl(url,{
          method:"GET",redirect:"error",cache:"no-store",credentials:"omit",
          headers:{accept:"application/json"},signal:AbortSignal.timeout(timeoutMs),
        });
        // Do not consume any body or log HTTP payloads, just status and latency.
        if(res?.status===200)success++;else failed++;
      }catch{failed++;}finally{
        elapsed.push(performance.now()-start);active--;
      }
    }
  }
  await Promise.all(Array.from({length:concurrent},()=>worker()));
  elapsed.sort((a,b)=>a-b);
  return {
    contract:"dentalflow-saas-local-pilot-v1",
    target:"loopback-only",total:count,concurrency_limit:concurrent,max_observed_concurrency:maxActive,
    success,failed,p50_ms:quantile(elapsed,.5),p95_ms:quantile(elapsed,.95),
    duration_ms:Number((performance.now()-started).toFixed(2)),
    warning:"Synthetic local HTTP /health smoke; NOT proof of DentalFlow capacity or 10k users.",
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runIsolatedPilot({url:process.env.DENTALFLOW_ISOLATED_PILOT_URL,
    count:Number(process.env.DENTALFLOW_PILOT_COUNT||20),
    concurrency:Number(process.env.DENTALFLOW_PILOT_CONCURRENCY||2)})
    .then(report=>{process.stdout.write(JSON.stringify(report)+"\n");if(report.failed>0)process.exitCode=1;})
    .catch(e=>{process.stderr.write(JSON.stringify({passed:false,code:e instanceof PilotUnsafeTarget?e.message:"PILOT_FAILED"})+"\n");process.exitCode=1;});
}
