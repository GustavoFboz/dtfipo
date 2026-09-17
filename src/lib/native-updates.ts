export type NativeUpdatePlatform = "windows" | "android";

export type NativeReleaseAsset = {
  id: number;
  name: string;
  downloadUrl: string;
  size: number;
  downloadCount: number;
  digest: string | null;
};

export type NativeRelease = {
  id: number;
  platform: NativeUpdatePlatform;
  version: string;
  tag: string;
  title: string;
  notes: string;
  publishedAt: string;
  pageUrl: string;
  mandatory: boolean;
  minimumVersion: string | null;
  installer: NativeReleaseAsset;
  checksum: NativeReleaseAsset | null;
};

export type NativeReleaseCatalog = {
  releases: NativeRelease[];
  checkedAt: number;
  source: "network" | "cache";
};

type GithubAsset = {
  id?: unknown;
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
  download_count?: unknown;
  digest?: unknown;
};

type GithubRelease = {
  id?: unknown;
  tag_name?: unknown;
  name?: unknown;
  body?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  created_at?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: unknown;
};

type ReleaseMetadata = {
  platform?: NativeUpdatePlatform;
  version?: string;
  mandatory?: boolean;
  minimumVersion?: string;
};

const RELEASES_API = "https://api.github.com/repos/GustavoFboz/dtfipo/releases?per_page=40";
const TRUSTED_DOWNLOAD_HOST = "github.com";
const TRUSTED_DOWNLOAD_PATH = "/GustavoFboz/dtfipo/releases/download/";
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_PLATFORM_RELEASES = 20;

function cacheKey(platform: NativeUpdatePlatform) {
  return `dentalflow:native-updates:v1:${platform}`;
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseVersion(value: string) {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])] as const,
    prerelease: match[4] ?? null,
  };
}

export function compareVersions(left: string, right: string) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < a.core.length; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, "en", { numeric: true });
}

export function isNewerVersion(candidate: string, installed: string) {
  return compareVersions(candidate, installed) > 0;
}

function metadataFromBody(body: string): ReleaseMetadata | null {
  const match = body.match(/<!--\s*dentalflow-update\s*([\s\S]*?)\s*-->/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as ReleaseMetadata;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function releaseNotes(body: string) {
  const withoutMetadata = body.replace(/<!--\s*dentalflow-update[\s\S]*?-->/gi, "").trim();
  return withoutMetadata.slice(0, 2_400);
}

function versionFromRelease(
  release: GithubRelease,
  platform: NativeUpdatePlatform,
  metadata: ReleaseMetadata | null,
) {
  if (metadata?.platform && metadata.platform !== platform) return null;
  if (metadata?.version && parseVersion(metadata.version)) return metadata.version;

  const tag = String(release.tag_name ?? "").trim();
  const prefix = platform === "windows" ? /^(?:windows|desktop)-v(.+)$/i : /^android-v(.+)$/i;
  const match = tag.match(prefix);
  return match && parseVersion(match[1]) ? match[1] : null;
}

function isPlatformInstaller(name: string, platform: NativeUpdatePlatform) {
  const lower = name.toLowerCase();
  if (platform === "android") return lower.endsWith(".apk");
  return lower.endsWith(".exe") && (lower.includes("setup") || lower.includes("installer"));
}

function assetPriority(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("setup")) return 0;
  if (lower.includes("installer")) return 1;
  return 2;
}

function normalizeAsset(raw: GithubAsset): NativeReleaseAsset | null {
  const name = String(raw.name ?? "").trim();
  const downloadUrl = String(raw.browser_download_url ?? "").trim();
  if (!name || !downloadUrl || !isTrustedInstallerUrl(downloadUrl)) return null;
  return {
    id: numeric(raw.id),
    name,
    downloadUrl,
    size: numeric(raw.size),
    downloadCount: numeric(raw.download_count),
    digest: typeof raw.digest === "string" && raw.digest.trim() ? raw.digest.trim() : null,
  };
}

function checksumFor(assets: GithubAsset[], installer: NativeReleaseAsset) {
  const exactNames = new Set([
    `${installer.name}.sha256`.toLowerCase(),
    installer.name.replace(/\.[^.]+$/, ".sha256").toLowerCase(),
  ]);
  const raw = assets.find((asset) => exactNames.has(String(asset.name ?? "").toLowerCase()));
  if (!raw) return null;
  const name = String(raw.name ?? "").trim();
  const downloadUrl = String(raw.browser_download_url ?? "").trim();
  if (!name || !isTrustedInstallerUrl(downloadUrl)) return null;
  return {
    id: numeric(raw.id),
    name,
    downloadUrl,
    size: numeric(raw.size),
    downloadCount: numeric(raw.download_count),
    digest: typeof raw.digest === "string" && raw.digest.trim() ? raw.digest.trim() : null,
  } satisfies NativeReleaseAsset;
}

export function isTrustedInstallerUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === TRUSTED_DOWNLOAD_HOST &&
      url.pathname.startsWith(TRUSTED_DOWNLOAD_PATH)
    );
  } catch {
    return false;
  }
}

export function normalizeGithubReleases(
  input: unknown,
  platform: NativeUpdatePlatform,
): NativeRelease[] {
  if (!Array.isArray(input)) return [];
  const normalized: NativeRelease[] = [];

  for (const raw of input as GithubRelease[]) {
    if (raw.draft === true || raw.prerelease === true) continue;
    const assets = Array.isArray(raw.assets) ? (raw.assets as GithubAsset[]) : [];
    const candidates = assets
      .filter((asset) => isPlatformInstaller(String(asset.name ?? ""), platform))
      .sort(
        (left, right) =>
          assetPriority(String(left.name ?? "")) - assetPriority(String(right.name ?? "")),
      );
    const installer = candidates.map(normalizeAsset).find(Boolean) ?? null;
    if (!installer) continue;

    const body = String(raw.body ?? "");
    const metadata = metadataFromBody(body);
    const version = versionFromRelease(raw, platform, metadata);
    if (!version) continue;

    normalized.push({
      id: numeric(raw.id),
      platform,
      version,
      tag: String(raw.tag_name ?? ""),
      title:
        String(raw.name ?? "").trim() ||
        `DentalFlow ${platform === "windows" ? "Windows" : "Android"} ${version}`,
      notes: releaseNotes(body),
      publishedAt: String(raw.published_at ?? raw.created_at ?? new Date(0).toISOString()),
      pageUrl: String(raw.html_url ?? ""),
      mandatory: metadata?.mandatory === true,
      minimumVersion:
        metadata?.minimumVersion && parseVersion(metadata.minimumVersion)
          ? metadata.minimumVersion
          : null,
      installer,
      checksum: checksumFor(assets, installer),
    });
  }

  return normalized
    .sort(
      (left, right) =>
        compareVersions(right.version, left.version) ||
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
    )
    .slice(0, MAX_PLATFORM_RELEASES);
}

function readCachedCatalog(platform: NativeUpdatePlatform): NativeReleaseCatalog | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(platform));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NativeReleaseCatalog;
    if (!Array.isArray(parsed?.releases) || !Number.isFinite(parsed?.checkedAt)) return null;
    return { ...parsed, source: "cache" };
  } catch {
    return null;
  }
}

function writeCachedCatalog(platform: NativeUpdatePlatform, catalog: NativeReleaseCatalog) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(platform), JSON.stringify(catalog));
  } catch {
    // A blocked/full WebView store must not disable update checks.
  }
}

export function clearNativeReleaseCache(platform: NativeUpdatePlatform) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(cacheKey(platform));
  } catch {
    // No-op: the next request can still bypass an unreadable cache.
  }
}

export async function fetchNativeReleases(
  platform: NativeUpdatePlatform,
): Promise<NativeReleaseCatalog> {
  const cached = readCachedCatalog(platform);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(RELEASES_API, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Catálogo respondeu com status ${response.status}.`);
    const releases = normalizeGithubReleases(await response.json(), platform);
    const catalog: NativeReleaseCatalog = { releases, checkedAt: Date.now(), source: "network" };
    writeCachedCatalog(platform, catalog);
    return catalog;
  } catch (error) {
    if (cached) return cached;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
