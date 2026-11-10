/**
 * Browser smoke against the LOCAL Vite app + REAL local Supabase stack only.
 * Uses throwaway identities from the same job. No screenshots, passwords or
 * HTML containing patient details leave this ephemeral machine.
 */
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";

const fail = code => { throw Error(code); };
const frontend = "http://127.0.0.1:4173";
const allowed = new Set([frontend, "http://127.0.0.1:54321"]);

async function waitUntilReady(child) {
  for(let i=0;i<90;i++) {
    if(child.exitCode!==null) fail("QA_LOCAL_BROWSER_FRONTEND_EXITED");
    try {
      const response=await fetch(frontend+"/auth", {signal:AbortSignal.timeout(1500)});
      if(response.ok) return;
    } catch {/* server may still be compiling */}
    await delay(1000);
  }
  fail("QA_LOCAL_BROWSER_FRONTEND_UNAVAILABLE");
}

export async function checkLocalWebUI({origin,anonKey,adminKey,actors}) {
  if (process.env.CI!=="true"||process.env.DENTALFLOW_BETA4_BROWSER_TEST!=="true")
    fail("QA_LOCAL_BROWSER_OPT_IN_REQUIRED");
  if (origin!=="http://127.0.0.1:54321" || actors?.length!==2
    || actors.some(a=>!a.email?.endsWith("@example.invalid")||!a.password||!a.patientId||!a.caseId))
    fail("QA_LOCAL_BROWSER_INPUT_REJECTED");
  const {chromium}=await import("playwright").catch(()=>fail("QA_LOCAL_BROWSER_ENGINE_UNAVAILABLE"));
  const child=spawn("bun",["run","dev","--host","127.0.0.1","--port","4173","--strictPort"],{
    env:{
      ...process.env,
      VITE_SUPABASE_URL:origin,
      VITE_SUPABASE_PUBLISHABLE_KEY:anonKey,
      SUPABASE_URL:origin,
      SUPABASE_PUBLISHABLE_KEY:anonKey,
      SUPABASE_ANON_KEY:anonKey,
      SUPABASE_SERVICE_ROLE_KEY:adminKey,
      ASAAS_PRODUCTION_ENABLED:"false",
      BILLING_PRODUCTION_ENABLED:"false",
      ASAAS_ENVIRONMENT:"sandbox",
      BILLING_ENVIRONMENT:"sandbox",
    },stdio:"ignore",
  });
  let browser;
  let phase="INIT";
  try {
    await waitUntilReady(child);
    browser=await chromium.launch({headless:true});
    const result={web_ui_own_case_visible:0,web_ui_cross_tenant_case_hidden:0,
      web_ui_case_detail_opened:0,web_ui_case_edit_form_submitted:0,
      web_ui_new_case_form_submitted:0,web_ui_own_attachment_list_visible:0};
    let external=false, externalCategory="RESOURCE";
    for(const actor of actors) {
      const other=actors.find(x=>x!==actor);
      const context=await browser.newContext({viewport:{width:1366,height:900}});
      try {
        await context.route("**/*",route=>{
          const url=route.request().url();
          let origin;
          try{origin=new URL(url).origin;}catch{external=true;return route.abort();}
          if(!allowed.has(origin)){
            // Cosmetic styles/fonts are optional: block them without treating
            // a failed external style import as clinical data exfiltration.
            // All remote scripts, XHR/fetch, documents, images, websockets,
            // Supabase hosts and other requests remain a hard failure.
            if(["stylesheet","font"].includes(route.request().resourceType()))
              return route.abort();
            external=true;
            const host=new URL(url).hostname;
            // Only return an opaque category; NEVER record an external URL or token.
            externalCategory=host.endsWith(".supabase.co")?"SUPABASE"
              : route.request().resourceType()==="font"?"FONT"
              : route.request().resourceType()==="stylesheet"?"STYLESHEET"
              : route.request().resourceType()==="image"?"IMAGE"
              : route.request().resourceType()==="script"?"SCRIPT"
              : "OTHER";
            return route.abort();
          }
          return route.continue();
        });
        const page=await context.newPage();
        await page.goto(frontend+"/auth",{waitUntil:"domcontentloaded",timeout:30000});
        await page.locator('input[type="email"]').first().fill(actor.email,{timeout:20000});
        await page.locator('input[autocomplete="current-password"]').first().fill(actor.password);
        await page.getByRole("button",{name:"Entrar",exact:true}).last().click();
        await page.waitForURL(u=>u.pathname!=="/auth",{timeout:30000});
        await page.goto(frontend+"/casos",{waitUntil:"domcontentloaded",timeout:30000});
        const own="DentalFlow isolated QA "+actor.label;
        const foreign="DentalFlow isolated QA "+other.label;
        const ownLabel=page.getByText(own,{exact:false}).first();
        await ownLabel.waitFor({state:"visible",timeout:30000});
        result.web_ui_own_case_visible++;
        if(await page.getByText(foreign,{exact:false}).count()!==0)
          fail("QA_LOCAL_BROWSER_FOREIGN_PATIENT_OR_CASE_RENDERED");
        result.web_ui_cross_tenant_case_hidden++;
        await ownLabel.click({timeout:15000});
        const dialog=page.getByRole("dialog").first();
        await dialog.waitFor({state:"visible",timeout:15000});
        if(!(await dialog.innerText()).includes(own))
          fail("QA_LOCAL_BROWSER_OWN_CASE_DETAIL_MISMATCH");
        result.web_ui_case_detail_opened++;
        // User-visible EDIT flow, not just an HTTP PATCH injected by the test.
        // Close the details dialog and open the existing case row's kebab menu.
        phase="DETAIL_CLOSE";
        await dialog.getByRole("button",{name:"Fechar",exact:true}).first().click();
        await dialog.waitFor({state:"hidden",timeout:15000});
        const row=ownLabel.locator('xpath=ancestor::*[@role="button"][1]');
        phase="CASE_MENU";
        await row.locator("button").last().click();
        phase="EDIT_OPEN";
        await page.getByRole("menuitem",{name:/Editar caso/i}).click();
        const editor=page.getByRole("dialog").last();
        await editor.getByRole("heading",{name:"Editar caso"}).waitFor({state:"visible",timeout:15000});
        const note="CI-EDIT-"+actor.label;
        phase="EDIT_FIELD";
        await editor.getByPlaceholder('Ex.: "(25)", "+ Inf."').fill(note,{timeout:12000});
        phase="EDIT_SAVE";
        await editor.getByRole("button",{name:"Salvar alterações"}).click();
        await editor.waitFor({state:"hidden",timeout:30000});
        const read=await fetch(origin+"/rest/v1/cases?id=eq."+actor.caseId+
          "&select=id,case_label",{
            headers:{"apikey":anonKey,"Authorization":"Bearer "+actor.jwt},
            cache:"no-store",signal:AbortSignal.timeout(10000)});
        if(!read.ok) fail("QA_LOCAL_BROWSER_OWN_EDIT_READBACK_HTTP");
        const updated=await read.json();
        if(!Array.isArray(updated)||updated.length!==1||
          updated[0].id!==actor.caseId||updated[0].case_label!==note)
          fail("QA_LOCAL_BROWSER_OWN_EDIT_NOT_PERSISTED");
        result.web_ui_case_edit_form_submitted++;
        // Exercise the actual new-case Web form against an existing fake
        // patient. This checks more than createCase RPC: button, patient combo,
        // form state, mutation, and newly committed case linked to this company.
        phase="CREATE_OPEN";
        await page.getByRole("button",{name:"Nova entrada",exact:true}).click();
        const create=page.getByRole("dialog").last();
        await create.getByRole("heading",{name:"Cadastrar novo caso"})
          .waitFor({state:"visible",timeout:15000});
        phase="CREATE_PATIENT_SELECTOR";
        await create.getByRole("button",
          {name:"Selecione ou digite o nome do paciente"}).click();
        phase="CREATE_PATIENT_PICK";
        await page.getByRole("button",{name:own,exact:true}).last().click();
        const newLabel="UI-CREATE-"+actor.label;
        phase="CREATE_LABEL";
        await create.getByPlaceholder('Ex.: "(25)", "+ Inf."').fill(newLabel);
        phase="CREATE_SAVE";
        await create.getByRole("button",{name:"Cadastrar caso",exact:true}).click();
        await create.waitFor({state:"hidden",timeout:30000});
        phase="CREATE_READBACK";
        const created=await fetch(origin+"/rest/v1/cases?case_label=eq."+
          encodeURIComponent(newLabel)+"&select=id,patient_id",{
          headers:{"apikey":anonKey,"Authorization":"Bearer "+actor.jwt},
          cache:"no-store",signal:AbortSignal.timeout(10000)});
        if(!created.ok) fail("QA_LOCAL_BROWSER_NEW_CASE_READBACK_HTTP");
        const newCases=await created.json();
        if(!Array.isArray(newCases)||newCases.length!==1
          ||newCases[0].patient_id!==actor.patientId)
          fail("QA_LOCAL_BROWSER_NEW_CASE_NOT_OWNED");
        result.web_ui_new_case_form_submitted++;
        // Mark a bounded, safe checkpoint before testing an additional tab.
        // This is NOT a full-test pass (overall workflow still fails closed).
        process.stdout.write("QA_LOCAL_WEB_CREATE_FORM_CHECKPOINT_OK\\n");
        // Reopen the original case, not the freshly inserted new one.
        phase="ATTACHMENT_REOPEN";
        const originalCase=page.getByText(own,{exact:false}).last();
        await originalCase.click({timeout:15000});
        const attachmentDialog=page.getByRole("dialog").first();
        await attachmentDialog.waitFor({state:"visible",timeout:15000});
        phase="ATTACHMENT_TAB_FIND";
        const tab=attachmentDialog.getByRole("button",
          {name:"Escaneamentos",exact:true});
        if(await tab.count()===0) fail("QA_LOCAL_BROWSER_ATTACHMENT_TAB_MISSING");
        phase="ATTACHMENT_TAB_KEYBOARD";
        await tab.first().press("Enter",{timeout:12000});
        phase="ATTACHMENT_LIST";
        await attachmentDialog.getByText("synthetic.stl",{exact:true}).first()
          .waitFor({state:"visible",timeout:12000});
        result.web_ui_own_attachment_list_visible++;
      } finally { await context.close(); }
    }
    if(external) fail("QA_LOCAL_BROWSER_EXTERNAL_"+externalCategory+"_BLOCKED");
    return {...result,ui_web_runtime:"local Vite browser with real synthetic Auth",
      ui_case_creation_form_submitted:result.web_ui_new_case_form_submitted===2,
      ui_case_edit_form_submitted:result.web_ui_case_edit_form_submitted===2,
      ui_private_attachment_list_verified:result.web_ui_own_attachment_list_visible===2,
      ui_private_attachment_preview_verified:false,
      deployed_ui_verified:false};
  } catch(error) {
    if(/^QA_LOCAL_BROWSER_[A-Z0-9_]+$/.test(error?.message||"")) throw error;
    fail("QA_LOCAL_BROWSER_"+phase+"_FAILED");
  } finally {
    if(browser) await browser.close().catch(()=>undefined);
    if(child.exitCode===null) child.kill("SIGTERM");
  }
}
