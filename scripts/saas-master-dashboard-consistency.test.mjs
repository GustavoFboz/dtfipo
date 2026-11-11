import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildMasterDashboard} from "./saas-build-master-dashboard.mjs";

const read=path=>JSON.parse(readFileSync(path,"utf8"));
const ui=read("src/data/saas-master-launch-panel.json");
const sources={
 plan:read("docs/saas/BETA-RELEASE-8-EXECUTIONS.json"),
 implementation:read("docs/saas/IMPLEMENTATION-PROGRESS.json"),
 technical:read("src/data/saas-protocol-progress.json"),
 p0:read("docs/saas/PAID-BETA-READINESS.json"),
 legal:read("docs/saas/legal/BETA6-LEGAL-APPROVAL-REGISTER.json"),
};
const copy=()=>structuredClone(sources);

test("single Master dashboard snapshot always matches source stage/formal/P0/legal counts",()=>{
 const built=buildMasterDashboard(copy());
 assert.deepEqual(ui,built);
 assert.equal(ui.schema,"dentalflow-saas-unified-master-dashboard-v2");
 assert.equal(ui.primary.percent,ui.primary.completed/ui.primary.total*100);
 assert.equal(ui.primary.completed,sources.plan.steps.filter(x=>x.status==="done").length);
 assert.equal(ui.other_controls.formal_accepted.completed,sources.implementation.official_acceptance.accepted_ids.length);
 assert.equal(ui.other_controls.p0.completed,sources.p0.checks.filter(x=>x.status==="verified").length);
 assert.equal(ui.other_controls.legal.completed,sources.legal.blocking_decisions.filter(x=>x.state==="verified").length);
 assert.equal(ui.other_controls.technical_implementation.completed,sources.technical.completed_implementation_criteria);
 assert.deepEqual(ui.stages.map(s=>s.id),[1,2,3,4,5,6,7,8]);
 assert.equal(ui.protocol_sections.reduce((n,x)=>n+x.items.length,0),23);
 assert.equal(ui.protocol_sections.length,7);
 assert.equal(ui.stages[5].substeps.filter(x=>/^L\d\d$/.test(x.id)).length,13);
 assert.equal(ui.stages[7].substeps.length,9);
});

test("partial financial and legal preparation cannot inflate the unique launch percentage",()=>{
 const {primary,stages,other_controls}=buildMasterDashboard(copy());
 assert.equal(primary.sales_authorized,false);
 assert.equal(stages[4].status,sources.plan.steps[4].status);
 assert.equal(stages[5].status,sources.plan.steps[5].status);
 assert.equal(other_controls.formal_accepted.total,23);
 assert.equal(other_controls.p0.total,8);
 assert.equal(other_controls.legal.total,13);
 assert.ok(stages[4].substeps.some(x=>x.status==="prepared"));
 assert.ok(stages[4].substeps.some(x=>x.status==="pending"));
 assert.ok(stages[5].substeps.some(x=>x.status==="pending"));
});

test("a single newly accepted phase advances only this primary figure and keeps sales locked",()=>{
 const data=copy();
 const phase=data.plan.steps[5];
 assert.notEqual(phase.status,"done");
 phase.status="done";
 phase.evidence.push("https://github.com/GustavoFboz/dtfipo/actions/runs/123456");
 const simulated=buildMasterDashboard(data);
 assert.equal(simulated.primary.completed,sources.plan.steps.filter(x=>x.status==="done").length+1);
 assert.equal(simulated.primary.percent,(simulated.primary.completed/8)*100);
 assert.equal(simulated.primary.sales_authorized,false);
 assert.equal(simulated.other_controls.p0.completed,0);
});

test("false completed stage or unaudited 100% are rejected",()=>{
 const missing=copy();
 missing.plan.steps[4].status="done";
 missing.plan.steps[4].evidence=[];
 assert.throws(()=>buildMasterDashboard(missing),/UNEVIDENCED_COMPLETE/);
 const unapproved=copy();
 for(const stage of unapproved.plan.steps){stage.status="done";stage.evidence=["https://github.com/example/evidence"];}
 assert.throws(()=>buildMasterDashboard(unapproved),/UNAUTHORIZED_PUBLICATION/);
});

test("no false P0 review or premature release can go through the display source",()=>{
 const fake=copy();
 fake.p0.checks[0].status="verified";
 fake.p0.checks[0].evidence=[];
 assert.throws(()=>buildMasterDashboard(fake),/UNSUPPORTED_P0_APPROVAL/);
 const released=copy();
 released.plan.release_state="published";
 released.plan.release_url="https://example.org";
 assert.throws(()=>buildMasterDashboard(released),/UNAUTHORIZED_PUBLICATION/);
});

test("the clean UI has one visually displayed percentage, stages, substeps and 23 original items",()=>{
 const source=readFileSync("src/components/master/MasterSaasProtocolProgress.tsx","utf8");
 assert.ok(source.includes("saas-master-launch-panel.json"));
 assert.ok(source.includes("release.primary.percent"));
 assert.ok(source.includes("release.next_advances"));
 assert.ok(source.includes("release.stages.map"));
 assert.ok(source.includes("stage.substeps.map"));
 assert.ok(source.includes("release.protocol_sections.map"));
 assert.ok(source.includes("criterion.substeps.map"));
 assert.ok(source.includes("release.other_controls.formal_accepted.completed"));
 assert.ok(source.includes("release.other_controls.legal.completed"));
 assert.equal((source.match(/<span className="ml-0\.5 text-2xl text-slate-400">%<\/span>/g)||[]).length,1);
 assert.equal(source.includes("progress.overall_progress_percent"),false);
 assert.ok(!source.includes("94.06"));
 assert.ok(!source.includes("56,52"));
});
