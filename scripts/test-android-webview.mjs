import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";

// Inspect the installed APK's real WebView, without a browser substitute or
// modifying backend authentication. Optional expiration fixtures use only the
// disposable CI emulator's local stores; no real identities or payments.
const adb = (...args) => execFileSync("adb", args, { encoding: "utf8" }).trim();
const pid = adb("shell", "pidof", process.env.DENTALFLOW_ANDROID_PACKAGE || "br.com.dentalflow.mobile");
adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
let sequence = 0;
const pending = new Map();
const errors = [];
try {
  let page;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const pages = await (await fetch("http://127.0.0.1:9222/json/list")).json();
      page = pages.find((item) => item.type === "page" && item.url.startsWith("https://localhost"));
      if (page) break;
    } catch {}
    await pause(1000);
  }
  assert.ok(page, "Installed app did not expose its local WebView");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); callback(message); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, (message) => {
      clearTimeout(timeout);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call("Runtime.enable");
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    ready = await evaluate(`location.pathname === '/auth' && !!document.querySelector('input[type="email"]') && !!document.querySelector('input[type="password"]')`);
    if (ready) break;
    await pause(1000);
  }
  assert.ok(ready, "Login form never rendered in installed APK");
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Criar conta').click()`);
  await pause(500);
  assert.ok(await evaluate(`document.body.innerText.includes('Tipo de conta')`), "React signup tab did not respond");
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Entrar').click()`);
  await pause(500);
  assert.ok(await evaluate(`!!document.querySelector('input[autocomplete="current-password"]')`), "Return to login failed");
  assert.equal(errors.length, 0, "Uncaught JavaScript errors during login interaction");
  let offlineExpiration = null;
  if (process.argv.includes("--offline-expiration")) {
    await evaluate(`(async () => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('dentalflow-mobile-local-v1', 1);
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      const tx = db.transaction(['cache','outbox'], 'readwrite');
      const done = new Promise((resolve, reject) => {
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      for (const owner of ['offline-expiry-fixture','offline-keeper-fixture']) {
        tx.objectStore('cache').put({id:owner+'::fixture::clinical', owner_id:owner, namespace:'fixture', key:'clinical', payload:{fixture:true}, updated_at:Date.now()});
        tx.objectStore('outbox').put({id:owner+'-pending', owner_id:owner, entity_type:'fixture', entity_id:null, operation:'create', payload:{fixture:true}, status:'pending', attempts:0, created_at:Date.now(), updated_at:Date.now()});
      }
      await done; db.close();
      sessionStorage.setItem('offline-expiry-fixture', 'fixture');
      localStorage.setItem('stock-item-draft:offline-expiry-fixture', 'fixture');
      document.cookie='offlineExpiryFixture=1; path=/; SameSite=Lax; Secure';
      const cache = await caches.open('offline-expiry-fixture');
      await cache.put('https://localhost/offline-expiry-fixture', new Response('fixture'));
      localStorage.setItem('dentalflow-mobile-device-identity:v1', JSON.stringify({
        user_id:'offline-expiry-fixture', email:null, full_name:null, clinic_id:null,
        validated_at:Date.now()-3*86400000-60000, valid_until:Date.now()+30*86400000
      }));
      window.dispatchEvent(new Event('focus'));
    })()`);
    for (let attempt = 0; attempt < 20; attempt++) {
      offlineExpiration = await evaluate(`(async () => {
        const db = await new Promise((resolve,reject) => {
          const r=indexedDB.open('dentalflow-mobile-local-v1',1); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
        });
        const count=(store,owner)=>new Promise((resolve,reject)=>{
          const r=db.transaction(store,'readonly').objectStore(store).index('owner').count(IDBKeyRange.only(owner));
          r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
        });
        const expiredCache=await count('cache','offline-expiry-fixture');
        const expiredOutbox=await count('outbox','offline-expiry-fixture');
        const otherCache=await count('cache','offline-keeper-fixture');
        const otherOutbox=await count('outbox','offline-keeper-fixture'); db.close();
        return {expiredCache,expiredOutbox,otherCache,otherOutbox,
          identityRemoved:localStorage.getItem('dentalflow-mobile-device-identity:v1')===null,
          draftRemoved:localStorage.getItem('stock-item-draft:offline-expiry-fixture')===null,
          snapshotRemoved:sessionStorage.getItem('offline-expiry-fixture')===null,
          browserCacheRemoved:!(await caches.keys()).includes('offline-expiry-fixture'),
          cookieRemoved:!document.cookie.includes('offlineExpiryFixture'),
          cleanupFinished:localStorage.getItem('dentalflow:offline-browser-cleanup-pending')===null,
          loginVisible:location.pathname==='/auth'&&!!document.querySelector('input[type="email"]')};
      })()`);
      if (offlineExpiration.expiredCache===0 && offlineExpiration.expiredOutbox===0
        && offlineExpiration.otherCache===1 && offlineExpiration.otherOutbox===1
        && ['identityRemoved','draftRemoved','snapshotRemoved','browserCacheRemoved','cookieRemoved','cleanupFinished','loginVisible']
          .every(key => offlineExpiration[key]===true)) break;
      await pause(1000);
    }
    assert.deepEqual(offlineExpiration,{expiredCache:0,expiredOutbox:0,otherCache:1,otherOutbox:1,
      identityRemoved:true,draftRemoved:true,snapshotRemoved:true,browserCacheRemoved:true,
      cookieRemoved:true,cleanupFinished:true,loginVisible:true},'Installed Android offline expiration did not remove private data and preserve the other owner');
    assert.equal(errors.length,0,'Uncaught JavaScript error during offline expiration');
    console.log('Installed APK: legacy offline authorization expired, cache/outbox/browser data removed, other owner preserved.');
  }
  console.log("Installed APK: login rendered and login/signup controls responded.");
  writeFileSync("android-webview-ui.log", JSON.stringify({ loginRendered: ready, interactive: true, offlineExpiration, errors }, null, 2));
  if (process.argv.includes("--crash-renderer")) {
    // The renderer closes the CDP connection. The native recovery screen is
    // asserted separately; a timeout alone is never considered a passed test.
    await call("Page.crash").catch(() => undefined);
  }
} finally {
  socket?.close();
  adb("forward", "--remove", "tcp:9222");
}
