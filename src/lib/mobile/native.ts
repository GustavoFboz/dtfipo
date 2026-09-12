import { Capacitor, registerPlugin } from '@capacitor/core';

interface DentalFlowPrintPlugin {
  printHtml(options: { html: string; jobName?: string }): Promise<void>;
}

const DentalFlowPrint = registerPlugin<DentalFlowPrintPlugin>('DentalFlowPrint');

export function isNativeMobileApp() {
  return Capacitor.isNativePlatform() && (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios');
}

export async function printHtmlNative(html: string, jobName = 'DentalFlow - Nota do caso') {
  if (!isNativeMobileApp()) return false;
  await DentalFlowPrint.printHtml({ html, jobName });
  return true;
}
