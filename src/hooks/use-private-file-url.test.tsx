// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const scope = { ownerId: "owner-1", generation: 1, ready: true };
  return {
    scope,
    resolve: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
});

vi.mock("@/lib/private-file-access", () => ({
  getPrivateFileScope: () => mocks.scope,
  getServerPrivateFileScope: () => ({ ownerId: null, generation: 0, ready: false }),
  resolvePrivateFile: mocks.resolve,
  subscribePrivateFileScope: mocks.subscribe,
}));

import { usePrivateFileUrl } from "./use-private-file-url";

function ResolvedImage({ reference }: { reference: string }) {
  return <span data-testid="url">{usePrivateFileUrl(reference) ?? ""}</span>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type Resolution = { url: string; renewAt: number; release?: () => void };

let root: Root;
let container: HTMLDivElement;
let mounted = false;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
});

afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  container.remove();
});

describe("usePrivateFileUrl cancellation", () => {
  it("releases a resolution that arrives after unmount", async () => {
    const pending = deferred<Resolution>();
    const release = vi.fn();
    mocks.resolve.mockReturnValue(pending.promise);
    await act(async () => { root.render(<ResolvedImage reference="storage://avatars/owner-1/avatar.jpg" />); });
    await act(async () => root.unmount());
    mounted = false;

    await act(async () => { pending.resolve({ url: "blob:late", renewAt: Date.now() + 60_000, release }); });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("keeps the current reference when an older request finishes late", async () => {
    const first = deferred<Resolution>();
    const second = deferred<Resolution>();
    const firstRelease = vi.fn();
    mocks.resolve.mockImplementation((reference: string) => reference.includes("first") ? first.promise : second.promise);

    await act(async () => { root.render(<ResolvedImage reference="storage://avatars/owner-1/first.jpg" />); });
    await act(async () => { root.render(<ResolvedImage reference="storage://avatars/owner-1/second.jpg" />); });
    await act(async () => { second.resolve({ url: "https://fixture.invalid/second.jpg", renewAt: Date.now() + 60_000 }); });
    expect(container.querySelector('[data-testid="url"]')?.textContent).toContain("second.jpg");

    await act(async () => { first.resolve({ url: "https://fixture.invalid/first.jpg", renewAt: Date.now() + 60_000, release: firstRelease }); });
    expect(firstRelease).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="url"]')?.textContent).toContain("second.jpg");
  });
});
