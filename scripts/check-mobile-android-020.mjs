import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const capacitor = read("capacitor.config.ts");
const vite = read("vite.mobile.config.ts");
const root = read("src/routes/index.tsx");
const bridge = read("src/components/MobileNativeBridge.tsx");
const runtime = read("src/lib/mobile/local-runtime.ts");
const desktopLocal = read("src/lib/desktop-local.ts");
const printButton = read("src/components/PrintNoteButton.tsx");
const systemPrint = read("src/lib/print-note/system-print.ts");
const workflow = read(".github/workflows/mobile-android.yml");
const mobileCss = read("src/mobile-app.css");
const soundPrepare = read("scripts/prepare-notification-sound.mjs");

expect(capacitor.includes("br.com.dentalflow.mobile"), "Android app id changed unexpectedly.");
expect(capacitor.includes("dentalflow_notification.mp3"), "Android notification channel must use the DentalFlow sound.");
expect(vite.includes("client.desktop.030.ts") && vite.includes("api.desktop.case-offline.ts"), "Android must use the installed local-first facades.");
expect(root.includes("isNativeMobileApp") && root.includes('redirect({ to: "/auth"'), "Native mobile must bypass the public landing page.");
expect(bridge.includes('const PUSH_ENABLED = import.meta.env.VITE_DENTALFLOW_PUSH_ENABLED === "true"'), "FCM must remain opt-in until provider provisioning is present.");
expect(bridge.includes('dentalflow-notifications-v2') && bridge.includes("dentalflow_notification.mp3"), "Android must create the versioned custom-sound notification channel.");
expect(runtime.includes("indexedDB.open") && runtime.includes('const OUTBOX_STORE = "outbox"'), "Android offline runtime must persist cache and outbox in IndexedDB.");
expect(runtime.includes("Capacitor.isNativePlatform()") && runtime.includes('Capacitor.getPlatform() === "android"'), "Android runtime detection must use Capacitor's supported API.");
expect(desktopLocal.includes("mobileLocal.isNativeMobileLocalRuntime()"), "Shared installed-client local-first facade must delegate to Android storage.");
expect(printButton.includes("isDentalFlowWindowsDesktop"), "Android printing must never be routed to Windows-only commands.");
expect(systemPrint.includes("isNativeMobileApp()") && systemPrint.includes("printHtmlNative"), "Case-note printing must use the Android Print Framework bridge.");
expect(workflow.includes("DentalFlow_Android_0.2.0.apk") && workflow.includes("versionName \"0.2.0\""), "Android release workflow must package version 0.2.0.");
expect(mobileCss.includes("--df-mobile-blue") && mobileCss.includes('[role="dialog"][data-state="open"]'), "Mobile UI layer must keep touch/dialog adaptations.");
expect(soundPrepare.includes("28416") || soundPrepare.includes("28_416"), "Custom notification sound integrity length must remain pinned.");
expect(soundPrepare.includes("3ab06b76690800dee2c80b15f58583458d2973606dea0bdcbdae3806e99cb326"), "Custom notification sound integrity hash must remain pinned.");

console.log("DentalFlow Android 0.2.0 native/offline/print/notification regressions: OK");
