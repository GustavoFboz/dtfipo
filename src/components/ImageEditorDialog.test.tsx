// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));
vi.mock("@/components/ui/slider", () => ({
  Slider: ({ disabled }: any) => <input type="range" disabled={disabled} />,
}));

import { ImageEditorDialog } from "./ImageEditorDialog";

class FakeImage {
  static instances: FakeImage[] = [];
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  naturalWidth = 800;
  naturalHeight = 600;
  private source = "";

  constructor() {
    FakeImage.instances.push(this);
  }

  set src(value: string) { this.source = value; }
  get src() { return this.source; }
}

const context = {
  fillStyle: "",
  strokeStyle: "",
  lineCap: "",
  lineJoin: "",
  lineWidth: 0,
  font: "",
  textBaseline: "",
  fillRect: vi.fn(),
  save: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  drawImage: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  strokeText: vi.fn(),
  fillText: vi.fn(),
};

let root: Root;
let container: HTMLDivElement;
let mounted = false;
let urlSequence = 0;
let createObjectUrl: ReturnType<typeof vi.spyOn>;
let revokeObjectUrl: ReturnType<typeof vi.spyOn>;

function file(name: string) {
  return new File(["image"], name, { type: "image/png" });
}

function confirmButton() {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Concluir")) as HTMLButtonElement;
}

async function render(fileValue: File | null, onConfirm = vi.fn()) {
  await act(async () => {
    root.render(<ImageEditorDialog open file={fileValue} onCancel={vi.fn()} onConfirm={onConfirm} />);
  });
  return onConfirm;
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  FakeImage.instances = [];
  urlSequence = 0;
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback: BlobCallback) {
    callback(new Blob(["edited"], { type: "image/jpeg" }));
  });
  createObjectUrl = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:qa-${++urlSequence}`);
  revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
});

afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ImageEditorDialog loading lifecycle", () => {
  it("shows the decoded selection, blocks confirmation while loading, and releases its source URL", async () => {
    await render(file("first.png"));
    expect(confirmButton().disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Carregando imagem");

    const source = FakeImage.instances[0]!;
    await act(async () => { source.onload?.(new Event("load")); });

    expect(container.querySelector('img[alt="Prévia de first.png"]')?.getAttribute("src")).toBe("blob:qa-1");
    expect(confirmButton().disabled).toBe(false);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    mounted = false;
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:qa-1");
  });

  it("ignores a stale load and exposes a decode failure for the current file", async () => {
    const first = file("first.png");
    await render(first);
    const stale = FakeImage.instances[0]!;

    await render(file("second.png"));
    const current = FakeImage.instances[1]!;
    await act(async () => { stale.onload?.(new Event("load")); });
    expect(container.querySelector('img[alt="Prévia de first.png"]')).toBeNull();
    expect(confirmButton().disabled).toBe(true);

    await act(async () => { current.onerror?.(new Event("error")); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível abrir esta imagem");
    expect(container.querySelector("img")).toBeNull();
    expect(confirmButton().disabled).toBe(true);
  });

  it("keeps crop confirmation functional and releases the temporary crop URL", async () => {
    const onConfirm = await render(file("crop.png"));
    await act(async () => { FakeImage.instances[0]!.onload?.(new Event("load")); });

    await act(async () => { confirmButton().click(); });
    expect(FakeImage.instances).toHaveLength(2);
    await act(async () => { FakeImage.instances[1]!.onload?.(new Event("load")); });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:qa-2");
  });

  it("preserves natural aspect ratio without max-width clamping for portrait and landscape images and matches output canvas", async () => {
    for (const { name, w, h } of [
      { name: "portrait.jpg", w: 1000, h: 2000 },
      { name: "landscape.jpg", w: 2000, h: 1000 },
    ]) {
      context.scale.mockClear();
      context.drawImage.mockClear();
      const onConfirm = await render(file(name));
      const source = FakeImage.instances.at(-1)!;
      source.naturalWidth = w;
      source.naturalHeight = h;
      await act(async () => { source.onload?.(new Event("load")); });

      const preview = container.querySelector(`img[alt="Prévia de ${name}"]`) as HTMLImageElement;
      expect(preview).not.toBeNull();
      expect(preview.style.width).toBe(`${w}px`);
      expect(preview.style.height).toBe(`${h}px`);
      expect(preview.style.maxWidth).toBe("none");
      expect(preview.style.maxHeight).toBe("none");
      expect(preview.style.transform).toContain("scale(0.32)");

      await act(async () => { confirmButton().click(); });
      const cropImg = FakeImage.instances.at(-1)!;
      await act(async () => { cropImg.onload?.(new Event("load")); });

      expect(context.scale).toHaveBeenCalledWith(0.64, 0.64);
      expect(context.drawImage).toHaveBeenCalledWith(source, -w / 2, -h / 2);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    }
  });
});
