// @vitest-environment happy-dom
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { act, createElement, Fragment, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { compile } from "tailwindcss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { confirm, ConfirmHost } from "./confirm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let sheet: HTMLStyleElement;
let nativeSheet: HTMLStyleElement;
let portalSheet: HTMLStyleElement;
const removeFile = vi.fn();

function CaseFixture() {
  const [open, setOpen] = useState(true);
  const [hasFile, setHasFile] = useState(true);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent>
      <DialogTitle>Caso de homologação</DialogTitle>
      <DialogDescription>Anexo fictício, sem dados clínicos.</DialogDescription>
      {hasFile && <button onClick={async () => {
        if (await confirm({ title: "Excluir arquivo", description: "Excluir teste.stl?", confirmText: "Excluir", destructive: true })) {
          removeFile(); setHasFile(false);
        }
      }}>Remover teste.stl</button>}
    </DialogContent>
  </Dialog>;
}

const alert = () => document.querySelector<HTMLElement>('[role="alertdialog"]');
const caseDialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
function button(label: string) {
  const element = [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === label);
  if (!element) throw new Error(`Missing button: ${label}`);
  return element;
}
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); }
async function click(label: string) { await act(async () => { button(label).click(); }); await settle(); }
async function renderCase(native = false) {
  document.documentElement.dataset.dentalflowNativeWindow = String(native);
  await act(async () => { root.render(createElement(Fragment, null, createElement(CaseFixture), createElement(ConfirmHost))); });
  await settle();
}
async function applyActualLayers() {
  // Compile the classes rendered by the real components, then apply the real
  // native overrides. No duplicated z-index values or mocked Radix components.
  const candidates = [...document.querySelectorAll("[class]")].flatMap((node) => [...node.classList]);
  const builder = await compile("@tailwind utilities;");
  sheet.textContent = builder.build(candidates.filter((name) => name.startsWith("z-")));
  nativeSheet.textContent = await readFile(resolve(process.cwd(), "src/desktop-native.css"), "utf8");
  portalSheet.textContent = await readFile(resolve(process.cwd(), "src/desktop-dialog-portals.css"), "utf8");
}

beforeEach(() => {
  removeFile.mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  sheet = document.createElement("style"); document.head.append(sheet);
  nativeSheet = document.createElement("style"); document.head.append(nativeSheet);
  portalSheet = document.createElement("style"); document.head.append(portalSheet);
});
afterEach(async () => {
  // Drain pending requests, including when an assertion fails before Cancel.
  for (let i = 0; i < 5 && alert(); i++) await click("Cancelar");
  await act(async () => { root.unmount(); }); await settle();
  host.remove(); sheet.remove(); nativeSheet.remove(); portalSheet.remove();
  delete document.documentElement.dataset.dentalflowNativeWindow;
});

describe("file confirmation above an open case", () => {
  it.each([false, true])("places the confirmation above the backdrop and the case (native=%s)", async (native) => {
    await renderCase(native); await click("Remover teste.stl"); await applyActualLayers();
    const content = alert()!;
    const overlay = content.previousElementSibling!;
    expect(overlay.getAttribute("data-state")).toBe("open");
    if (native) {
      expect(Number(getComputedStyle(caseDialog()!).zIndex))
        .toBeGreaterThan(Number(getComputedStyle(caseDialog()!.previousElementSibling!).zIndex));
    }
    expect(Number(getComputedStyle(overlay).zIndex)).toBeGreaterThan(Number(getComputedStyle(caseDialog()!).zIndex));
    expect(Number(getComputedStyle(content).zIndex)).toBeGreaterThan(Number(getComputedStyle(overlay).zIndex));
    expect(content.contains(document.activeElement)).toBe(true);
    await click("Cancelar");
    expect(alert()).toBeNull(); expect(caseDialog()).not.toBeNull(); expect(removeFile).not.toHaveBeenCalled();
    // The existing case remains usable after the confirmation closes.
    await click("Remover teste.stl"); expect(alert()).not.toBeNull(); await click("Cancelar");
  });

  it("does not delete before confirmation and closes only the confirmation after accepting", async () => {
    await renderCase(); await click("Remover teste.stl");
    expect(removeFile).not.toHaveBeenCalled();
    await click("Excluir");
    expect(removeFile).toHaveBeenCalledTimes(1); expect(alert()).toBeNull(); expect(caseDialog()).not.toBeNull();
    expect(caseDialog()!.textContent).not.toContain("Remover teste.stl");
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await settle();
    expect(caseDialog()).toBeNull(); expect(document.body.style.pointerEvents).not.toBe("none");
  });

  it("cancels with Escape without closing or deleting the case", async () => {
    await renderCase(); await click("Remover teste.stl");
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await settle();
    expect(alert()).toBeNull(); expect(caseDialog()).not.toBeNull(); expect(removeFile).not.toHaveBeenCalled();
  });

  it("keeps a queued request pending after the previous Action fires its close callback", async () => {
    await act(async () => { root.render(createElement(ConfirmHost)); });
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = confirm({ title: "Primeira confirmação" });
      second = confirm({ title: "Segunda confirmação" });
    }); await settle();
    await click("Confirmar"); expect(await first).toBe(true);
    expect(alert()?.textContent).toContain("Segunda confirmação");
    await click("Cancelar"); expect(await second).toBe(false);
  });

  it("keeps a queued request pending after the previous Cancel fires its close callback", async () => {
    await act(async () => { root.render(createElement(ConfirmHost)); });
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = confirm({ title: "Primeira confirmação" });
      second = confirm({ title: "Segunda confirmação" });
    }); await settle();
    await click("Cancelar"); expect(await first).toBe(false);
    expect(alert()?.textContent).toContain("Segunda confirmação");
    await click("Confirmar"); expect(await second).toBe(true);
  });
});
