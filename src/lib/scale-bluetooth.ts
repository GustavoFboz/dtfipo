/**
 * Leitura de peso via balança Bluetooth (Web Bluetooth — Weight Scale 0x181D).
 * Funciona em Chrome/Edge desktop e Android. Retorna o peso em gramas.
 */

const WEIGHT_SCALE_SERVICE = 0x181d;
const WEIGHT_MEASUREMENT_CHAR = 0x2a9d;

export function isScaleSupported() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

type Nav = Navigator & {
  bluetooth: {
    requestDevice: (o: unknown) => Promise<{
      gatt?: {
        connect: () => Promise<{
          getPrimaryService: (s: number) => Promise<{
            getCharacteristic: (c: number) => Promise<{
              startNotifications: () => Promise<unknown>;
              addEventListener: (t: string, cb: (e: Event) => void) => void;
            }>;
          }>;
        }>;
      };
    }>;
  };
};

function parseWeight(dv: DataView): number {
  // Flags (byte 0): bit0 = 0 => SI (kg, resolução 0.005), 1 => imperial (lb)
  const flags = dv.getUint8(0);
  const raw = dv.getUint16(1, true);
  if (flags & 0x01) return raw * 0.01 * 453.59237; // lb -> g
  return raw * 0.005 * 1000; // kg -> g
}

/** Conecta a uma balança e chama onWeight a cada leitura. Retorna função de desconexão. */
export async function connectScale(onWeight: (grams: number) => void): Promise<() => void> {
  if (!isScaleSupported()) throw new Error("Este navegador não suporta Bluetooth (use Chrome ou Edge).");
  const nav = navigator as Nav;
  const device = await nav.bluetooth.requestDevice({
    filters: [{ services: [WEIGHT_SCALE_SERVICE] }],
    optionalServices: [WEIGHT_SCALE_SERVICE],
  });
  const gatt = await device.gatt?.connect();
  if (!gatt) throw new Error("Não foi possível conectar à balança.");
  const service = await gatt.getPrimaryService(WEIGHT_SCALE_SERVICE);
  const char = await service.getCharacteristic(WEIGHT_MEASUREMENT_CHAR);
  const handler = (e: Event) => {
    const value = (e.target as unknown as { value?: DataView }).value;
    if (value) onWeight(Math.round(parseWeight(value)));
  };
  char.addEventListener("characteristicvaluechanged", handler);
  await char.startNotifications();
  return () => {
    try {
      (device as unknown as { gatt?: { disconnect: () => void } }).gatt?.disconnect();
    } catch {
      /* ignore */
    }
  };
}
