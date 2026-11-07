import { Capacitor, registerPlugin } from '@capacitor/core';

interface DentalFlowPrintPlugin {
  printHtml(options: { html: string; jobName?: string; paper?: "a4"; landscape?: boolean }): Promise<void>;
}
interface DentalFlowFilePlugin {
  savePdf(options: { base64: string; fileName: string }): Promise<{ saved: boolean; uri?: string; fileName?: string }>;
}

const DentalFlowPrint = registerPlugin<DentalFlowPrintPlugin>('DentalFlowPrint');
const DentalFlowFile = registerPlugin<DentalFlowFilePlugin>('DentalFlowFile');
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

export async function printHtmlNative(
  html: string,
  jobName = 'DentalFlow - Nota do caso',
  options?: { paper?: "a4"; landscape?: boolean },
) {
  if (!isNativeMobileApp()) return false;
  await DentalFlowPrint.printHtml({ html, jobName, ...options });
  return true;
}

export async function savePdfNative(base64: string, fileName: string) {
  if (!isNativeMobileApp()) throw new Error("O salvamento nativo de PDF não está disponível neste dispositivo.");
  return DentalFlowFile.savePdf({ base64, fileName });
}
