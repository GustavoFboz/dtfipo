import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";

// Inspect the installed APK's real WebView, without a browser substitute or
// modifying authentication. Runs only against the disposable CI emulator.
const adb = (...args) => execFileSync("adb", args, { encoding: "utf8" }).trim();
const pid = adb("shell", "pidof", "br.com.dentalflow.mobile");
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
  console.log("Installed APK: login rendered and login/signup controls responded.");
  writeFileSync("android-webview-ui.log", JSON.stringify({ loginRendered: ready, interactive: true, errors }, null, 2));
} finally {
  socket?.close();
  adb("forward", "--remove", "tcp:9222");
}
