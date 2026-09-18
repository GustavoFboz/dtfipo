import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const component = read("src/components/NativeUpdateCenter.tsx");
const catalog = read("src/lib/native-updates.ts");
const runtime = read("src/lib/native-update-runtime.ts");
const route = read("src/routes/_authenticated/route.tsx");
const appShell = read("src/components/AppShell.tsx");
const clinicShell = read("src/components/ClinicShell.tsx");
const hub = read("src/routes/_authenticated/hub.tsx");
const desktopLocal = read("src/lib/desktop-local.ts");
const mobileRuntime = read("src/lib/mobile/local-runtime.ts");
const mobileBridge = read("src/components/MobileNativeBridge.tsx");
const tauri = read("src-tauri/tauri.conf.json");
const cargo = read("src-tauri/Cargo.toml");
const capabilities = read("src-tauri/capabilities/default.json");
const windowsWorkflow = read(".github/workflows/desktop-windows.yml");
const androidWorkflow = read(".github/workflows/mobile-android.yml");
const androidRelease = read("scripts/prepare-android-release.py");

const desktopVersion = String(JSON.parse(tauri).version || "");
const androidVersion = androidRelease.match(/VERSION = "([^"]+)"/)?.[1] ?? "";

expect(desktopVersion === "0.6.6", "The first Windows update-center release must be 0.6.6.");
expect(androidVersion === "0.3.0", "The current Android update-center release must be 0.3.0.");
expect(cargo.includes(`version = "${desktopVersion}"`), "Tauri and Cargo versions must match.");

expect(
  route.includes("NativeUpdateCenterProvider"),
  "The authenticated native application must mount one update-center provider.",
);
expect(
  appShell.includes("NativeUpdateCenterButton"),
  "Laboratory headers must expose the update center.",
);
expect(
  clinicShell.includes("NativeUpdateCenterButton"),
  "Clinic headers must expose the update center.",
);
expect(
  hub.includes("NativeUpdateCenterButton"),
  "The environment hub must expose the update center.",
);
expect(
  component.includes("if (!center?.runtime) return null"),
  "The update trigger must be absent when no installed runtime is detected.",
);
expect(
  runtime.includes("return null"),
  "Web/PWA runtime must not receive the native update center.",
);

expect(
  catalog.includes('platform === "android"') && catalog.includes('lower.endsWith(".apk")'),
  "Android catalog must accept only APK installers.",
);
expect(
  catalog.includes('lower.endsWith(".exe")') && catalog.includes('lower.includes("setup")'),
  "Windows catalog must accept only installer EXEs.",
);
expect(
  catalog.includes("TRUSTED_DOWNLOAD_PATH"),
  "Installer URLs must be restricted to official DentalFlow releases.",
);
expect(
  component.includes("dentalflow:native-update-notification") &&
    mobileBridge.includes("dentalflow:native-update-notification"),
  "Android update availability must use its isolated native notification channel.",
);
expect(
  component.includes("sendDesktopNativeNotification"),
  "Windows update availability must produce one native notification.",
);
expect(
  component.includes("BACKGROUND_CHECK_INTERVAL_MS"),
  "The catalog must be checked again during long-running sessions.",
);

expect(
  desktopLocal.includes("openDesktopExternalUrl"),
  "Windows downloads must leave the WebView through the native opener.",
);
expect(
  mobileRuntime.includes("App.getInfo()"),
  "Android must report the installed app version from Capacitor.",
);
expect(
  capabilities.includes("opener:allow-open-url") &&
    capabilities.includes("GustavoFboz/dtfipo/releases/download"),
  "Tauri opener permissions must be scoped to official release assets.",
);

for (const [workflow, platform, version] of [
  [windowsWorkflow, "windows", desktopVersion],
  [androidWorkflow, "android", androidVersion],
]) {
  expect(
    workflow.includes("contents: write"),
    `${platform} release workflow needs permission to publish installers.`,
  );
  expect(
    workflow.includes("gh release create") && workflow.includes("gh release upload"),
    `${platform} workflow must publish permanent GitHub Releases.`,
  );
  expect(
    workflow.includes(`${platform}-v$` + "RELEASE_VERSION") ||
      workflow.includes(`tag=${platform}-v$VERSION`) ||
      workflow.includes(`tag=${platform}-v$version`),
    `${platform} release tag must remain platform-specific.`,
  );
  expect(
    workflow.includes(version),
    `${platform} workflow does not reference its current release version.`,
  );
}

expect(
  androidWorkflow.includes("DENTALFLOW_ANDROID_KEYSTORE_BASE64"),
  "Android publishing must support a retained signing identity.",
);
expect(
  fs.existsSync(`docs/releases/windows-${desktopVersion}.md`),
  "Windows release notes are missing.",
);
expect(
  fs.existsSync(`docs/releases/android-${androidVersion}.md`),
  "Android release notes are missing.",
);

console.log(`DentalFlow native update center ${desktopVersion}/${androidVersion}: contract OK`);
