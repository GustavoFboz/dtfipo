import { Capacitor, registerPlugin } from '@capacitor/core';

interface DentalFlowPrintPlugin {
  printHtml(options: { html: string; jobName?: string }): Promise<void>;
}

const DentalFlowPrint = registerPlugin<DentalFlowPrintPlugin>('DentalFlowPrint');
const DentalFlowPrivacy = registerPlugin<{ clearPrivateCache(): Promise<void> }>('DentalFlowPrivacy');

export async function clearMobilePrivateBrowserCache() {
  if (Capacitor.getPlatform() !== 'android') {
    throw new Error('A limpeza nativa de cache precisa ser homologada neste aplicativo iOS.');
  }
  await DentalFlowPrivacy.clearPrivateCache();
}

export function isNativeMobileApp() {
  return Capacitor.isNativePlatform() && (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios');
}

export async function printHtmlNative(html: string, jobName = 'DentalFlow - Nota do caso') {
  if (!isNativeMobileApp()) return false;
  await DentalFlowPrint.printHtml({ html, jobName });
  return true;
}
