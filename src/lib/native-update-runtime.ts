import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

import {
  getDesktopRuntimeInfo,
  isDentalFlowWindowsDesktop,
  openDesktopExternalUrl,
} from "@/lib/desktop-local";
import { isTrustedInstallerUrl, type NativeUpdatePlatform } from "@/lib/native-updates";

export type NativeUpdateRuntime = {
  platform: NativeUpdatePlatform;
  version: string;
  label: "Windows" | "Android";
};

export async function resolveNativeUpdateRuntime(): Promise<NativeUpdateRuntime | null> {
  if (typeof window === "undefined") return null;

  if (isDentalFlowWindowsDesktop()) {
    const info = await getDesktopRuntimeInfo();
    return { platform: "windows", version: info.version, label: "Windows" };
  }

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    const info = await App.getInfo();
    return { platform: "android", version: info.version, label: "Android" };
  }

  return null;
}

export async function openNativeInstaller(runtime: NativeUpdateRuntime, url: string) {
  if (!isTrustedInstallerUrl(url)) throw new Error("O endereço deste instalador não é confiável.");

  if (runtime.platform === "android") {
    await Browser.open({ url });
    return;
  }

  await openDesktopExternalUrl(url);
}
