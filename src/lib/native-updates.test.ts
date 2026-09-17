import { describe, expect, test } from "vitest";

import {
  compareVersions,
  isNewerVersion,
  isTrustedInstallerUrl,
  normalizeGithubReleases,
} from "./native-updates";

const releases = [
  {
    id: 10,
    tag_name: "windows-v0.6.7",
    name: "DentalFlow Windows 0.6.7",
    body: '<!-- dentalflow-update {"platform":"windows","version":"0.6.7","mandatory":false} -->\n- Central nativa',
    html_url: "https://github.com/GustavoFboz/dtfipo/releases/tag/windows-v0.6.7",
    published_at: "2026-09-17T09:00:00Z",
    assets: [
      {
        id: 1,
        name: "dentalflow-desktop.exe",
        browser_download_url:
          "https://github.com/GustavoFboz/dtfipo/releases/download/windows-v0.6.7/dentalflow-desktop.exe",
        size: 12,
      },
      {
        id: 2,
        name: "DentalFlow_Windows_0.6.7_x64-setup.exe",
        browser_download_url:
          "https://github.com/GustavoFboz/dtfipo/releases/download/windows-v0.6.7/DentalFlow_Windows_0.6.7_x64-setup.exe",
        size: 100,
        digest: "sha256:windows",
      },
      {
        id: 3,
        name: "DentalFlow_Windows_0.6.7_x64-setup.sha256",
        browser_download_url:
          "https://github.com/GustavoFboz/dtfipo/releases/download/windows-v0.6.7/DentalFlow_Windows_0.6.7_x64-setup.sha256",
        size: 64,
      },
    ],
  },
  {
    id: 11,
    tag_name: "android-v0.2.3",
    name: "DentalFlow Android 0.2.3",
    body: '<!-- dentalflow-update {"platform":"android","version":"0.2.3"} -->\n- Inicialização protegida',
    html_url: "https://github.com/GustavoFboz/dtfipo/releases/tag/android-v0.2.3",
    published_at: "2026-09-17T10:00:00Z",
    assets: [
      {
        id: 4,
        name: "DentalFlow_Android_0.2.3.apk",
        browser_download_url:
          "https://github.com/GustavoFboz/dtfipo/releases/download/android-v0.2.3/DentalFlow_Android_0.2.3.apk",
        size: 90,
      },
    ],
  },
  {
    id: 12,
    tag_name: "windows-v9.9.9",
    name: "Rascunho",
    draft: true,
    assets: [],
  },
];

describe("catálogo nativo de atualizações", () => {
  test("compara versões sem confundir ordenação textual", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(isNewerVersion("0.6.7", "0.6.6")).toBe(true);
  });

  test("isola instaladores Windows e prefere o setup", () => {
    const result = normalizeGithubReleases(releases, "windows");
    expect(result).toHaveLength(1);
    expect(result[0].version).toBe("0.6.7");
    expect(result[0].installer.name).toContain("setup.exe");
    expect(result[0].notes).toContain("Central nativa");
  });

  test("isola APKs Android", () => {
    const result = normalizeGithubReleases(releases, "android");
    expect(result).toHaveLength(1);
    expect(result[0].installer.name).toBe("DentalFlow_Android_0.2.3.apk");
    expect(result[0].platform).toBe("android");
  });

  test("aceita apenas assets HTTPS do repositório oficial", () => {
    expect(
      isTrustedInstallerUrl(
        "https://github.com/GustavoFboz/dtfipo/releases/download/android-v0.2.3/app.apk",
      ),
    ).toBe(true);
    expect(isTrustedInstallerUrl("https://example.com/app.apk")).toBe(false);
    expect(
      isTrustedInstallerUrl("http://github.com/GustavoFboz/dtfipo/releases/download/x/app.apk"),
    ).toBe(false);
  });
});
