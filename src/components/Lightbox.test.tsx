// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-preserve-page-scroll", () => ({ usePreservePageScroll: vi.fn() }));
vi.mock("@/components/PrivateImage", () => ({
  PrivateImage: ({ src, alt, onError, onClick }: any) => <img src={src} alt={alt} onError={onError} onClick={onClick} />,
}));
vi.mock("@/lib/private-file-access", () => ({
  getPrivateFileScope: vi.fn(),
  resolvePrivateFile: vi.fn(),
}));

import { Lightbox } from "./Lightbox";

let root: Root;
let container: HTMLDivElement;
const onIndexChange = vi.fn();
const onClose = vi.fn();

async function render(url: string, index = 0) {
  await act(async () => {
    root.render(<Lightbox open images={[{ url, name: "Clínica" }]} index={index} onIndexChange={onIndexChange} onClose={onClose} />);
  });
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("Lightbox image state", () => {
  it("shows a visible failure after resolver retries and recovers when the image changes", async () => {
    await render("storage://patient-files/patient-1/first.png");
    const image = container.querySelector("img")!;
    await act(async () => { image.dispatchEvent(new Event("error")); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível exibir esta imagem");
    expect(container.querySelector("img")).toBeNull();

    await render("storage://patient-files/patient-1/second.png");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toContain("second.png");
  });

  it("uses an available image instead of failing on a stale out-of-range index", async () => {
    await render("storage://patient-files/patient-1/first.png", 4);
    expect(container.querySelector("img")?.getAttribute("src")).toContain("first.png");
    expect(container.textContent).toContain("1/1");
  });
});
