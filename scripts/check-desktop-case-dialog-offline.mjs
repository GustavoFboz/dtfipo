import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const frame = read("src/components/DesktopNativeFrame.tsx");
const portalCss = read("src/desktop-dialog-portals.css");
const dialog = read("src/components/ui/dialog.tsx");
const casesLocal = read("src/lib/cases-local-first.ts");
const caseActivity = read("src/lib/case-activity.ts");
const apiCaseOffline = read("src/lib/api.desktop.case-offline.ts");
const notificationsLocal = read("src/lib/notifications-local-first.ts");
const desktopSync = read("src/lib/desktop-sync.ts");
const desktopVite = read("vite.desktop.config.ts");
const tauri = read("src-tauri/tauri.conf.json");
const cargo = read("src-tauri/Cargo.toml");

expect(
  frame.indexOf('import "@/desktop-native.css"') < frame.indexOf('import "@/desktop-dialog-portals.css"'),
  "The native portal correction must load after legacy native shell styles.",
);
expect(dialog.includes('z-[1200]'), "Radix Dialog overlay/content baseline z-index changed unexpectedly.");
expect(
  portalCss.includes('body > [role="dialog"]') && portalCss.includes("z-index: 1210 !important"),
  "Native dialogs must render above the z-1200 blur overlay.",
);
expect(
  portalCss.includes('body > [role="alertdialog"]') && portalCss.includes("z-index: 1310 !important"),
  "Nested confirmation dialogs must remain above the case dialog.",
);
expect(
  portalCss.includes('[data-radix-popper-content-wrapper]') && portalCss.includes("z-index: 1400 !important"),
  "Select/popover portals must remain interactive above case dialogs.",
);

expect(casesLocal.includes('operation: "create"'), "Offline case creation must enqueue a durable case outbox entry.");
expect(
  casesLocal.includes('await cloud.createCase({ ...(payload.input ?? {}), id, also_arch: null } as any)'),
  "Queued offline cases must be created in Lovable Cloud on reconnect.",
);
expect(
  desktopVite.includes("api.desktop.case-offline.ts"),
  "Desktop API alias must include the offline case assignment wrapper.",
);
expect(
  apiCaseOffline.includes("startedOffline") && apiCaseOffline.includes("sendInternalNotificationLocalFirst"),
  "Offline case creation must persist the assigned dentist notification.",
);
expect(
  apiCaseOffline.includes('source: "desktop_offline_case_create"'),
  "Offline-created case notifications must carry a durable source marker.",
);
expect(
  caseActivity.includes("queueOfflineStakeholderNotifications"),
  "Case stakeholder notifications need an explicit offline path.",
);
expect(
  caseActivity.includes("fetchCaseByIdLocalFirst(opts.caseId)"),
  "Offline notifications must resolve recipients from the local case snapshot.",
);
expect(
  caseActivity.includes("sendInternalNotificationLocalFirst"),
  "Offline stakeholder notifications must use the durable notification outbox.",
);
expect(
  caseActivity.includes("queued_offline: true"),
  "Queued case notifications must be identifiable after synchronization.",
);
expect(
  notificationsLocal.includes('operation: "send"') && notificationsLocal.includes("syncPendingNotificationChanges"),
  "Notification outbox replay must remain enabled.",
);
expect(
  desktopSync.indexOf("syncPendingCaseChanges") < desktopSync.indexOf("syncPendingNotificationChanges"),
  "Desktop sync must create offline cases before replaying their team notifications.",
);

expect(tauri.includes('"version": "0.2.9"'), "DentalFlow Desktop version must be 0.2.9.");
expect(cargo.includes('version = "0.2.9"'), "Rust package version must match Desktop 0.2.9.");
expect(
  tauri.includes('"frontendDist": "../dist/client"'),
  "The full frontend must remain bundled in the Windows installer for offline navigation.",
);

console.log("Desktop 0.2.9 case dialog/offline case regression checks passed.");
