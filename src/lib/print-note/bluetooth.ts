/**
 * Web Bluetooth ESC/POS thermal printer driver — com reconexão automática
 * em background. Suporta mini-impressoras térmicas BLE (GOOJPRT, MTP-II,
 * Phomemo, etc.) expondo serviço 18F0 / characteristic 2AF1.
 */

const PRIMARY_SERVICE = 0x18f0;
const WRITE_CHAR = 0x2af1;
const DEVICE_ID_KEY = "print.bt.deviceId";

// Serviços/características usados por impressoras térmicas BLE conhecidas.
// A ordem importa: tentamos do mais comum ao menos comum.
const KNOWN_SERVICES: (number | string)[] = [
  0x18f0,                                   // GOOJPRT, MTP-II, Phomemo (padrão)
  0xff00,                                   // muitas genéricas chinesas
  0xffe0,                                   // HM-10 style
  0xfee7,                                   // Tenda / algumas Xprinter
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",   // ISSC/Microchip transparent UART
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",   // outras variantes
];
const KNOWN_WRITE_CHARS: (number | string)[] = [
  0x2af1,
  0xff02,
  0xffe1,
  0xfee8,
  "49535343-8841-43f4-a8d4-ecbe34729bb3",   // ISSC transparent TX
];

let cachedDevice: any = null;
let cachedChar: any = null;
let connecting: Promise<any> | null = null;

function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

export function bluetoothSupported(): boolean {
  return isWebBluetoothAvailable();
}

function rememberDevice(device: any) {
  try {
    if (device?.id) localStorage.setItem(DEVICE_ID_KEY, device.id);
  } catch {}
}

function attachDisconnectListener(device: any) {
  device.addEventListener("gattserverdisconnected", () => {
    cachedChar = null;
    // tentativa silenciosa de reconexão em background
    setTimeout(() => { connectGatt(device).catch(() => {}); }, 800);
  });
}

async function findWritableCharacteristic(device: any) {
  // Tenta serviços conhecidos primeiro (rápido); depois faz varredura ampla.
  for (const svc of KNOWN_SERVICES) {
    try {
      const service = await device.gatt.getPrimaryService(svc);
      for (const ch of KNOWN_WRITE_CHARS) {
        try {
          const c = await service.getCharacteristic(ch);
          if (c.properties?.write || c.properties?.writeWithoutResponse) return c;
        } catch {}
      }
      // fallback: qualquer característica gravável dentro do serviço
      const chars = await service.getCharacteristics();
      const writable = chars.find((c: any) => c.properties?.write || c.properties?.writeWithoutResponse);
      if (writable) return writable;
    } catch {}
  }
  // varredura completa: todos serviços primários
  try {
    const services = await device.gatt.getPrimaryServices();
    for (const service of services) {
      const chars = await service.getCharacteristics();
      const writable = chars.find((c: any) => c.properties?.write || c.properties?.writeWithoutResponse);
      if (writable) return writable;
    }
  } catch {}
  return null;
}

async function connectGatt(device: any) {
  if (!device?.gatt) throw new Error("Dispositivo Bluetooth inválido");
  if (!device.gatt.connected) await device.gatt.connect();
  const characteristic = await findWritableCharacteristic(device);
  if (!characteristic) {
    throw new Error("Impressora conectada, mas nenhum canal de escrita compatível foi encontrado. Verifique se é uma impressora térmica ESC/POS Bluetooth.");
  }
  cachedDevice = device;
  cachedChar = characteristic;
  return characteristic;
}

/** Recupera silenciosamente um device já pareado (sem abrir o popup). */
async function findPairedDevice(): Promise<any | null> {
  if (!isWebBluetoothAvailable()) return null;
  const bt = (navigator as any).bluetooth;
  if (typeof bt.getDevices !== "function") return null;
  try {
    const devices = await bt.getDevices();
    if (!devices?.length) return null;
    const savedId = (() => { try { return localStorage.getItem(DEVICE_ID_KEY); } catch { return null; } })();
    return devices.find((d: any) => d.id === savedId) ?? devices[0] ?? null;
  } catch {
    return null;
  }
}

/** Abre o picker do navegador (gesto do usuário obrigatório). */
export async function pickPrinter() {
  if (!isWebBluetoothAvailable()) {
    throw new Error("Bluetooth não suportado neste navegador. Use Chrome/Edge no desktop ou Android.");
  }
  // acceptAllDevices porque a maioria das mini-impressoras térmicas NÃO anuncia
  // o serviço no pacote de advertising — filtrar por service esconderia elas.
  const device = await (navigator as any).bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: KNOWN_SERVICES,
  });
  rememberDevice(device);
  attachDisconnectListener(device);
  await connectGatt(device);
  return { device, characteristic: cachedChar };
}

async function ensurePrinter() {
  if (cachedDevice && cachedChar && cachedDevice.gatt?.connected) {
    return { device: cachedDevice, characteristic: cachedChar };
  }
  if (connecting) return connecting;
  connecting = (async () => {
    // 1) reusar device já pareado, se possível
    const known = cachedDevice ?? (await findPairedDevice());
    if (known) {
      try {
        attachDisconnectListener(known);
        await connectGatt(known);
        return { device: known, characteristic: cachedChar };
      } catch {
        // cai para o picker
      }
    }
    // 2) pedir ao usuário (gesto requerido pelo browser)
    return pickPrinter();
  })();
  try { return await connecting; }
  finally { connecting = null; }
}

/** Tenta conectar em background, sem popup. Silencioso. */
export async function tryAutoConnectPrinter(): Promise<boolean> {
  if (!isWebBluetoothAvailable()) return false;
  if (cachedDevice?.gatt?.connected && cachedChar) return true;
  try {
    const known = await findPairedDevice();
    if (!known) return false;
    attachDisconnectListener(known);
    await connectGatt(known);
    return true;
  } catch {
    return false;
  }
}

function canvasToRaster(canvas: HTMLCanvasElement): Uint8Array {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, w, h).data;
  const bytesPerRow = Math.ceil(w / 8);
  const out = new Uint8Array(bytesPerRow * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (v < 128) {
        const byteIdx = y * bytesPerRow + (x >> 3);
        out[byteIdx] |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

/** Comandos de aquecimento (ESC 7) + densidade (GS ( E / DC2 #) por intensidade. */
function heatingCommands(density: "baixa" | "media" | "alta"): Uint8Array {
  // ESC 7 n1 n2 n3 → max dots, heating time, heating interval
  // n1 = max heating dots × 8 (até 255 → 2040 dots). Mais alto = mais corrente simultânea.
  // n2 = heating time (×10 µs). Mais alto = pixel mais escuro, mas aquece o cabeçote.
  // n3 = heating interval (×10 µs). Mais alto = mais frio, mais lento.
  let n1 = 11, n2 = 120, n3 = 2;          // alta (default)
  let densityLevel = 4;                    // GS ( E fn=5: 0..4 (delta), traduz pra +50%
  let dc2 = 13;                            // DC2 # n: 0..31 (fallback antigo, 13 ≈ +50%)
  if (density === "media") { n1 = 9; n2 = 90; n3 = 3; densityLevel = 2; dc2 = 9; }
  if (density === "baixa") { n1 = 7; n2 = 60; n3 = 4; densityLevel = 0; dc2 = 5; }
  return new Uint8Array([
    0x1b, 0x40,                                            // ESC @
    0x1b, 0x37, n1, n2, n3,                                // ESC 7 — aquecimento
    0x12, 0x23, dc2,                                       // DC2 # n — densidade (fallback)
    0x1d, 0x28, 0x45, 0x03, 0x00, 0x05, densityLevel, 0x00,// GS ( E pL pH fn a b — densidade
  ]);
}

/**
 * ESC/POS raster em bandas separadas (não concatenadas). Retorna lista
 * pra podermos pausar entre as bandas e dar tempo do cabeçote esfriar —
 * sem isso, o fim do papel sai "fantasma".
 */
function buildBands(canvas: HTMLCanvasElement, bandRows = 64): Uint8Array[] {
  const w = canvas.width;
  const h = canvas.height;
  const bytesPerRow = Math.ceil(w / 8);
  const raster = canvasToRaster(canvas);
  const bands: Uint8Array[] = [];
  for (let yStart = 0; yStart < h; yStart += bandRows) {
    const rows = Math.min(bandRows, h - yStart);
    const sliceLen = rows * bytesPerRow;
    const band = new Uint8Array(8 + sliceLen);
    band.set([
      0x1d, 0x76, 0x30, 0x00,
      bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
      rows & 0xff, (rows >> 8) & 0xff,
    ], 0);
    band.set(raster.subarray(yStart * bytesPerRow, yStart * bytesPerRow + sliceLen), 8);
    bands.push(band);
  }
  return bands;
}

const FEED_TAIL = new Uint8Array([0x1b, 0x64, 0x04, 0x0a, 0x0a]); // ESC d 4 + LF*2

async function writeChunks(char: any, data: Uint8Array, chunk = 200) {
  const canFast = typeof char.writeValueWithoutResponse === "function";
  let i = 0;
  while (i < data.length) {
    const slice = new Uint8Array(data.subarray(i, i + chunk));
    try {
      if (canFast) await char.writeValueWithoutResponse(slice);
      else await char.writeValue(slice);
      i += chunk;
    } catch {
      const small = new Uint8Array(data.subarray(i, i + 120));
      await char.writeValue(small);
      i += 120;
    }
  }
}

export async function printCanvasBluetooth(
  canvas: HTMLCanvasElement,
  density: "baixa" | "media" | "alta" = "alta",
): Promise<void> {
  const { characteristic } = await ensurePrinter();
  const heat = heatingCommands(density);
  const bands = buildBands(canvas);

  const send = async (char: any) => {
    await writeChunks(char, heat);
    // pausa entre bandas: dá tempo do cabeçote esfriar/reaquecer → sem fade no rodapé
    const gap = density === "alta" ? 6 : density === "media" ? 3 : 1;
    for (const band of bands) {
      await writeChunks(char, band);
      await new Promise(r => setTimeout(r, gap));
    }
    await writeChunks(char, FEED_TAIL);
  };

  try {
    await send(characteristic);
  } catch (err) {
    cachedChar = null;
    const retry = await ensurePrinter();
    await send(retry.characteristic);
  }
}

export async function printRawBluetooth(
  payload: Uint8Array,
  density: "baixa" | "media" | "alta" = "media",
): Promise<void> {
  const { characteristic } = await ensurePrinter();
  const heat = heatingCommands(density);

  const send = async (char: any) => {
    await writeChunks(char, heat);
    await writeChunks(char, payload);
  };

  try {
    await send(characteristic);
  } catch {
    cachedChar = null;
    const retry = await ensurePrinter();
    await send(retry.characteristic);
  }
}

export function disconnectPrinter() {
  try { cachedDevice?.gatt?.disconnect(); } catch {}
  cachedDevice = null;
  cachedChar = null;
  try { localStorage.removeItem(DEVICE_ID_KEY); } catch {}
}
