/**
 * Offline photo prefetch cache — the mirror of photoQueue.ts.
 *
 * photoQueue pushes locally captured photos UP to blob storage. This pulls
 * server photos DOWN to the device, so an assessor standing in front of a
 * machine with no signal can still see the hazard photo they are comparing
 * against. It exists for the control review (the whole verdict card is that
 * comparison) but every photo in the app benefits.
 *
 * Three parts:
 *   1. The cache      — files under cached_photos/, an AsyncStorage index
 *                       mapping url -> { localPath, siteId, bytes, ... }.
 *   2. The prefetch    — prefetchSite(): resolve a project's photo URLs from
 *                       WatermelonDB, download the missing ones, report
 *                       progress, cancellable.
 *   3. The resolver    — resolveCachedUri(): the sync lookup every <Image>
 *                       goes through, via components/CachedImage.tsx.
 *
 * Deliberately NOT wired into sync(). Prefetch is user-initiated over wifi; a
 * sync that silently downloaded 300 MB would be a bug, and processPhotoQueue()
 * must stay the first thing sync() does (context.md §17).
 *
 * Only http(s) URLs ever enter the index. A file:// path is a photo still
 * waiting for the upload queue — it is already on disk, and photoQueue deletes
 * it once uploaded, so caching one would leave a dangling entry behind.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '@/db';

const CACHE_DIR = FileSystem.documentDirectory + 'cached_photos/';
const INDEX_KEY = 'photo_cache_index';
const PART_SUFFIX = '.part';

/**
 * Cache budget.
 *
 * Measured against the live database (2026-08-28): a project holds a median of
 * 105 server photos and 247 at the 90th percentile, and a sample of 25 hazard
 * photos ran 54 KB – 6.4 MB, median 472 KB, mean 1.2 MB. So the median project
 * is 50–130 MB and a p90 project 120–300 MB.
 *
 * 1.5 GB therefore holds the median project a dozen times over and a p90
 * project five times over, which is what actually matters: the realistic use is
 * caching two or three projects before a trip, not one. A 500 MB cap would not
 * reliably hold even a single large project (the largest in the database is
 * ~1,750 photos, 0.8–2.2 GB), and a cap that cannot hold one project turns
 * every prefetch into an eviction of the last one.
 *
 * The one project bigger than the whole budget is handled honestly rather than
 * silently: the run stops, and the project reports "1,200 of 1,754 · cache
 * full" so the assessor knows photos are missing before they are on site.
 */
export const CACHE_CAP_BYTES = 1_500 * 1024 * 1024;

/**
 * Per-photo estimate used only to decide how much headroom to free BEFORE a run
 * (plan §6: eviction runs before a prefetch, the run needs the headroom). The
 * measured mean above; replaced by this cache's own observed average once there
 * is enough of it to mean anything.
 */
const ESTIMATED_PHOTO_BYTES = 1.2 * 1024 * 1024;
const MIN_ENTRIES_FOR_OWN_AVERAGE = 10;

/** Parallel downloads. Enough to keep wifi busy, few enough to stay readable. */
const DOWNLOAD_CONCURRENCY = 4;

/** Coalescing window for change notifications, so 200 files are not 200 renders. */
const NOTIFY_INTERVAL_MS = 400;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheEntry {
  localPath: string;
  /**
   * The project whose prefetch cached this URL. Attribution, not ownership: a
   * library evaluation can put the same URL in two projects, and the second
   * project reads it from the cache without re-downloading. If the attributed
   * project is evicted the file goes, and the other project then honestly
   * reports itself as incompletely cached.
   */
  siteId: string;
  bytes: number;
  cachedAt: number;
}

export interface SiteCacheMeta {
  /**
   * Least-recently-opened-PROJECT eviction is per project, so recency lives
   * here and not on the entry. Touched when the project screen opens and when a
   * prefetch runs — never on an image read, which would mean an AsyncStorage
   * write on every render.
   */
  lastAccessedAt: number;
  /** When a run last finished with every photo of the project on the device. */
  completedAt: number | null;
}

interface CacheIndex {
  version: 1;
  entries: Record<string, CacheEntry>;
  sites: Record<string, SiteCacheMeta>;
}

export interface PrefetchProgress {
  total: number;
  done: number;
  failed: number;
  bytes: number;
}

export interface PrefetchResult extends PrefetchProgress {
  cancelled: boolean;
  /** Ran out of budget with nothing left to evict. Some photos are missing. */
  stoppedForSpace: boolean;
}

export interface SiteCacheStatus {
  /** http(s) photo URLs this project holds. */
  total: number;
  /** How many of them are on the device. */
  cached: number;
  bytes: number;
  completedAt: number | null;
  isComplete: boolean;
}

export interface CacheUsage {
  bytes: number;
  count: number;
  cap: number;
}

// ---------------------------------------------------------------------------
// The index — loaded once, held in memory so the resolver can be synchronous
// ---------------------------------------------------------------------------

/** A factory, not a constant: a shallow copy would share `entries` and `sites`. */
const emptyIndex = (): CacheIndex => ({ version: 1, entries: {}, sites: {} });

let _index: CacheIndex | null = null;
let _loading: Promise<CacheIndex> | null = null;
let _writeChain: Promise<unknown> = Promise.resolve();
let _prefetchActive = false;

const _listeners = new Set<() => void>();
let _notifyTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Load the index and make sure the cache directory exists. Safe to call as
 * often as you like; the work happens once.
 *
 * This is not a prefetch and downloads nothing — it is just what makes
 * resolveCachedUri() able to answer without awaiting.
 */
export function initPhotoCache(): Promise<CacheIndex> {
  if (_index) return Promise.resolve(_index);
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      }
      const raw = await AsyncStorage.getItem(INDEX_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      _index =
        parsed && parsed.version === 1 && parsed.entries && parsed.sites
          ? (parsed as CacheIndex)
          : emptyIndex();
    } catch (e: any) {
      console.warn('[PhotoPrefetch] Index load failed, starting empty:', e?.message ?? e);
      _index = emptyIndex();
    }
    _notify();
    // Half-written files from a run that was killed mid-flight. They have no
    // index entry, so nothing reads them — they would just occupy the budget.
    void sweepOrphanFiles();
    return _index!;
  })();
  return _loading;
}

/** Serialised read-modify-write of the index. Mirrors photoQueue's discipline. */
function _withIndex<T>(mutator: (index: CacheIndex) => T | Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const index = await initPhotoCache();
    const result = await mutator(index);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
    _notify();
    return result;
  };
  const next = _writeChain.then(run, run);
  _writeChain = next.catch(() => undefined);
  return next;
}

function _notify(): void {
  if (_notifyTimer) return;
  _notifyTimer = setTimeout(() => {
    _notifyTimer = null;
    for (const fn of [..._listeners]) {
      try { fn(); } catch { /* a listener must not break the cache */ }
    }
  }, NOTIFY_INTERVAL_MS);
}

/** Subscribe to index changes. Returns an unsubscribe function. */
export function subscribeCache(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

/**
 * The cached local path for a URL, or the URL unchanged.
 *
 * Synchronous by design: an <Image> must be able to render from disk on its
 * first frame. Before initPhotoCache() has resolved this returns the URL
 * unchanged; CachedImage re-resolves once the index is in memory.
 */
export function resolveCachedUri(url: string | null | undefined): string | null | undefined {
  if (!url || !_index) return url;
  return _index.entries[url]?.localPath ?? url;
}

/** True if this URL is on the device right now. */
export function isCached(url: string | null | undefined): boolean {
  return !!url && !!_index?.entries[url];
}

/**
 * Forget one URL — used when an <Image> fails to load a cached path, which
 * means the file is gone from disk (app data cleared, OS reclaimed it) while
 * the index still claims it. Dropping the entry falls the app back to the
 * network instead of showing a permanently broken image.
 */
export async function forgetCachedUrl(url: string): Promise<void> {
  await _withIndex(index => {
    const entry = index.entries[url];
    if (!entry) return;
    delete index.entries[url];
    void FileSystem.deleteAsync(entry.localPath, { idempotent: true }).catch(() => undefined);
  });
}

// ---------------------------------------------------------------------------
// Which photos belong to a project
// ---------------------------------------------------------------------------

/**
 * Every server photo URL this project holds, resolved from WatermelonDB rather
 * than the API — this has to work for a project the assessor last opened a week
 * ago, on a train.
 *
 * Note there is no control illustration here: risk_evaluations.control_image_url
 * exists server-side but is in neither the WatermelonDB schema nor either sync
 * allowlist, so the device has never seen the column and there is no URL to
 * cache. Adding it is a schema change, not a prefetch change.
 */
export async function resolveSitePhotoUrls(siteId: string): Promise<string[]> {
  const db = getDatabase();
  const urls: string[] = [];
  // Only server photos. A file:// path is already on disk and belongs to the
  // upload queue, which will delete it — see the file header.
  const push = (value: unknown): void => {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) urls.push(value);
  };

  const assemblies = (await db
    .get('assemblies')
    .query(Q.where('site_id', siteId))
    .fetch()) as any[];
  const assemblyIds = assemblies.map(a => a.id);
  for (const a of assemblies) {
    push(a._raw.picture_url);
    push(a._raw.nameplate_photo_url);
  }

  const machines = assemblyIds.length
    ? ((await db
        .get('machines')
        .query(Q.where('assembly_id', Q.oneOf(assemblyIds)))
        .fetch()) as any[])
    : [];
  const machineIds = machines.map(m => m.id);
  for (const m of machines) {
    push(m._raw.picture_url);
    push(m._raw.nameplate_photo_url);
  }

  // risk_evaluations.site_id is optional on the device — an evaluation raised
  // under a machine is written with `site_id ?? null` — so walk the asset spine
  // as well or the machine-level hazard photos, which are most of them, are
  // missed.
  const evalClauses = [Q.where('site_id', siteId)];
  if (assemblyIds.length) evalClauses.push(Q.where('assembly_id', Q.oneOf(assemblyIds)));
  if (machineIds.length) evalClauses.push(Q.where('machine_id', Q.oneOf(machineIds)));
  const evaluations = (await db
    .get('risk_evaluations')
    .query(Q.or(...evalClauses))
    .fetch()) as any[];
  for (const ev of evaluations) {
    push(ev._raw.photo_url);
    push(ev._raw.photo_original_url);
  }

  const checklistClauses = [Q.where('site_id', siteId)];
  if (assemblyIds.length) checklistClauses.push(Q.where('assembly_id', Q.oneOf(assemblyIds)));
  const checklists = (await db
    .get('checklist_instances')
    .query(Q.or(...checklistClauses))
    .fetch()) as any[];
  const checklistIds = checklists.map(c => c.id);
  const responses = checklistIds.length
    ? ((await db
        .get('checklist_responses')
        .query(Q.where('checklist_id', Q.oneOf(checklistIds)))
        .fetch()) as any[])
    : [];
  for (const r of responses) push(r._raw.photo_url);

  const floorPlans = (await db
    .get('floor_plans')
    .query(Q.where('site_id', siteId))
    .fetch()) as any[];
  for (const fp of floorPlans) push(fp._raw.image_url);

  // Guarded: a build whose schema predates v13 has no such collection, and a
  // missing project photo cache must not throw on the project screen.
  try {
    const rounds = (await db
      .get('control_review_rounds')
      .query(Q.where('site_id', siteId))
      .fetch()) as any[];
    const roundIds = rounds.map(r => r.id);
    const reviews = roundIds.length
      ? ((await db
          .get('control_reviews')
          .query(Q.where('round_id', Q.oneOf(roundIds)))
          .fetch()) as any[])
      : [];
    for (const cr of reviews) {
      push(cr._raw.photo_url);
      push(cr._raw.photo_original_url);
      // A JSON string on the device, holding the customer's portal evidence.
      // Those URLs carry their own 10-year read SAS token, so they fetch as-is
      // — and the query string is part of the identity, never stripped.
      const claims = cr._raw.client_claim_photo_urls;
      if (Array.isArray(claims)) {
        claims.forEach(push);
      } else if (typeof claims === 'string' && claims) {
        try {
          const parsed = JSON.parse(claims);
          if (Array.isArray(parsed)) parsed.forEach(push);
        } catch {
          console.warn('[PhotoPrefetch] Unparseable client_claim_photo_urls on', cr.id);
        }
      }
    }
  } catch {
    // Control review tables not present in this build — nothing to add.
  }

  return [...new Set(urls)];
}

// ---------------------------------------------------------------------------
// Status and usage
// ---------------------------------------------------------------------------

export async function getSiteCacheStatus(siteId: string): Promise<SiteCacheStatus> {
  const index = await initPhotoCache();
  const urls = await resolveSitePhotoUrls(siteId);
  let cached = 0;
  let bytes = 0;
  for (const url of urls) {
    const entry = index.entries[url];
    if (!entry) continue;
    cached++;
    bytes += entry.bytes;
  }
  return {
    total: urls.length,
    cached,
    bytes,
    completedAt: index.sites[siteId]?.completedAt ?? null,
    isComplete: urls.length > 0 && cached === urls.length,
  };
}

export async function getCacheUsage(): Promise<CacheUsage> {
  const index = await initPhotoCache();
  const entries = Object.values(index.entries);
  return {
    bytes: entries.reduce((sum, e) => sum + e.bytes, 0),
    count: entries.length,
    cap: CACHE_CAP_BYTES,
  };
}

/** Record that a project was opened. This is what eviction orders projects by. */
export async function touchSite(siteId: string): Promise<void> {
  if (!siteId) return;
  await _withIndex(index => {
    const existing = index.sites[siteId];
    index.sites[siteId] = {
      lastAccessedAt: Date.now(),
      completedAt: existing?.completedAt ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// The prefetch run
// ---------------------------------------------------------------------------

const _cancelled = new Set<string>();
let _runningSiteId: string | null = null;

export function isPrefetching(siteId?: string): boolean {
  return siteId ? _runningSiteId === siteId : _runningSiteId !== null;
}

/** Ask a running prefetch to stop after its in-flight downloads settle. */
export function cancelPrefetch(siteId: string): void {
  if (_runningSiteId === siteId) _cancelled.add(siteId);
}

/**
 * Download every server photo of a project that is not already on the device.
 *
 * Idempotent — an already-cached URL is not fetched again, so this doubles as
 * "cache the remaining photos" after a cancelled or space-limited run.
 */
export async function prefetchSite(
  siteId: string,
  onProgress?: (p: PrefetchProgress) => void,
): Promise<PrefetchResult> {
  if (_runningSiteId) {
    throw new Error('A project is already being cached. Wait for it to finish or cancel it.');
  }
  // Claimed synchronously, before the first await: two taps in quick succession
  // must not start two runs over the same files.
  _runningSiteId = siteId;
  _cancelled.delete(siteId);
  _prefetchActive = true;

  let stoppedForSpace = false;
  try {
    const index = await initPhotoCache();
    const urls = await resolveSitePhotoUrls(siteId);
    const missing = urls.filter(u => !index.entries[u]);

    const progress: PrefetchProgress = {
      total: urls.length,
      done: urls.length - missing.length,
      failed: 0,
      bytes: 0,
    };

    if (missing.length === 0) {
      await _withIndex(i => {
        i.sites[siteId] = { lastAccessedAt: Date.now(), completedAt: urls.length ? Date.now() : null };
      });
      return { ...progress, cancelled: false, stoppedForSpace: false };
    }

    console.log(`[PhotoPrefetch] ${missing.length} of ${urls.length} photo(s) to cache for site ${siteId}`);

    // Orphans first: they occupy the budget and nothing can read them.
    await sweepOrphanFiles({ force: true });
    // Then make room. Before the run, not after — the run needs the headroom.
    await _evictForHeadroom(missing.length * _perPhotoEstimate(index), siteId);

    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (_cancelled.has(siteId) || stoppedForSpace) return;
        const url = missing[cursor++];
        if (url === undefined) return;

        // Re-check the budget between files. The pre-run figure was an
        // estimate; real photos run from 54 KB to 6.4 MB.
        if (await _usedBytes() >= CACHE_CAP_BYTES) {
          const freed = await _evictForHeadroom(_perPhotoEstimate(_index!) * 20, siteId);
          if (!freed) {
            stoppedForSpace = true;
            console.warn('[PhotoPrefetch] Cache full and nothing left to evict — stopping run');
            return;
          }
        }

        try {
          const bytes = await _downloadOne(url, siteId);
          progress.done++;
          progress.bytes += bytes;
        } catch (e: any) {
          progress.failed++;
          console.warn(`[PhotoPrefetch] Failed ${url}:`, e?.message ?? e);
        }
        onProgress?.({ ...progress });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, missing.length) }, worker),
    );

    const cancelled = _cancelled.has(siteId);
    const complete = !cancelled && !stoppedForSpace && progress.failed === 0 && progress.done === urls.length;
    await _withIndex(i => {
      i.sites[siteId] = {
        lastAccessedAt: Date.now(),
        completedAt: complete ? Date.now() : i.sites[siteId]?.completedAt ?? null,
      };
    });

    console.log(
      `[PhotoPrefetch] Site ${siteId}: ${progress.done}/${progress.total} cached, ` +
      `${progress.failed} failed${cancelled ? ', cancelled' : ''}${stoppedForSpace ? ', cache full' : ''}`,
    );
    return { ...progress, cancelled, stoppedForSpace };
  } finally {
    _runningSiteId = null;
    _cancelled.delete(siteId);
    _prefetchActive = false;
  }
}

/**
 * Download one URL to the cache.
 *
 * Written to a .part file and moved into place only once it is complete and
 * plausible, so killing the app mid-run can leave an orphan file but never a
 * truncated file that the index calls cached. The index entry is written per
 * file, not once at the end, for the same reason photoQueue dequeues per
 * upload: a killed run keeps everything it actually finished.
 */
async function _downloadOne(url: string, siteId: string): Promise<number> {
  const localPath = CACHE_DIR + (await _cacheFileName(url));
  const partPath = localPath + PART_SUFFIX;

  try {
    const result = await FileSystem.downloadAsync(url, partPath);
    if (result.status !== 200) {
      // An error body — 403 XML, a redirect page — would otherwise be cached as
      // a .jpg and only discovered on a shop floor.
      throw new Error(`HTTP ${result.status}`);
    }
    const info = await FileSystem.getInfoAsync(partPath);
    const bytes = info.exists ? info.size : 0;
    if (!bytes) throw new Error('Empty response body');

    await FileSystem.deleteAsync(localPath, { idempotent: true });
    await FileSystem.moveAsync({ from: partPath, to: localPath });

    await _withIndex(index => {
      index.entries[url] = { localPath, siteId, bytes, cachedAt: Date.now() };
    });
    return bytes;
  } catch (e) {
    await FileSystem.deleteAsync(partPath, { idempotent: true }).catch(() => undefined);
    throw e;
  }
}

/**
 * SHA-256 of the WHOLE URL, query string included.
 *
 * Customer evidence photos from the client portal carry a 10-year read SAS
 * token in their query string. Keying on the URL without its query would
 * collide those and break every one of them.
 */
async function _cacheFileName(url: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, url);
  return `${digest}.${_extensionOf(url)}`;
}

const KNOWN_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'pdf']);

function _extensionOf(url: string): string {
  const path = url.split('?')[0];
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return KNOWN_EXTENSIONS.has(ext) ? ext : 'jpg';
}

// ---------------------------------------------------------------------------
// Budget and eviction
// ---------------------------------------------------------------------------

async function _usedBytes(): Promise<number> {
  const index = await initPhotoCache();
  return Object.values(index.entries).reduce((sum, e) => sum + e.bytes, 0);
}

function _perPhotoEstimate(index: CacheIndex): number {
  const entries = Object.values(index.entries);
  if (entries.length < MIN_ENTRIES_FOR_OWN_AVERAGE) return ESTIMATED_PHOTO_BYTES;
  return entries.reduce((sum, e) => sum + e.bytes, 0) / entries.length;
}

/**
 * Free space until `bytesNeeded` fits under the cap, evicting whole projects
 * least-recently-opened first.
 *
 * Whole projects, not individual files (plan §6): a half-evicted project is
 * worse than an absent one, because the assessor cannot tell which photos are
 * missing until they are standing in front of the machine. Evicting the project
 * entirely makes it report itself as not cached.
 *
 * Returns true if it freed anything.
 */
async function _evictForHeadroom(bytesNeeded: number, protectSiteId: string): Promise<boolean> {
  const index = await initPhotoCache();
  const used = Object.values(index.entries).reduce((sum, e) => sum + e.bytes, 0);
  if (used + bytesNeeded <= CACHE_CAP_BYTES) return false;

  // Group by attributed project. Entries whose project is unknown to the sites
  // map have no recency, so they go first.
  const bySite = new Map<string, { bytes: number; urls: string[] }>();
  for (const [url, entry] of Object.entries(index.entries)) {
    if (entry.siteId === protectSiteId) continue;
    const bucket = bySite.get(entry.siteId) ?? { bytes: 0, urls: [] };
    bucket.bytes += entry.bytes;
    bucket.urls.push(url);
    bySite.set(entry.siteId, bucket);
  }

  const order = [...bySite.entries()].sort(
    (a, b) =>
      (index.sites[a[0]]?.lastAccessedAt ?? 0) - (index.sites[b[0]]?.lastAccessedAt ?? 0),
  );

  let freed = 0;
  const evictedSites: string[] = [];
  const doomedUrls: string[] = [];
  for (const [siteId, bucket] of order) {
    if (used - freed + bytesNeeded <= CACHE_CAP_BYTES) break;
    freed += bucket.bytes;
    evictedSites.push(siteId);
    doomedUrls.push(...bucket.urls);
  }
  if (doomedUrls.length === 0) return false;

  await _dropEntries(doomedUrls, evictedSites);

  console.log(
    `[PhotoPrefetch] Evicted ${evictedSites.length} project(s), ` +
    `${Math.round(freed / 1024 / 1024)} MB, to make room`,
  );
  return true;
}

/**
 * Delete these URLs' files and index entries, and mark the named projects as no
 * longer fully cached. The one place entries leave the index, so a project can
 * never be left claiming a completed cache it no longer has.
 */
async function _dropEntries(urls: string[], siteIdsToReset: string[]): Promise<number> {
  if (urls.length === 0 && siteIdsToReset.length === 0) return 0;
  return _withIndex(async i => {
    let bytes = 0;
    for (const url of urls) {
      const entry = i.entries[url];
      if (!entry) continue;
      bytes += entry.bytes;
      delete i.entries[url];
      await FileSystem.deleteAsync(entry.localPath, { idempotent: true }).catch(() => undefined);
    }
    for (const siteId of siteIdsToReset) {
      if (i.sites[siteId]) i.sites[siteId].completedAt = null;
    }
    return bytes;
  });
}

/**
 * Remove one project's photos from the device.
 *
 * The affordance that matches how an assessor actually thinks about this: the
 * visit is done, this project's photos can go. Without it the only manual
 * control is the all-or-nothing clear in settings, and everything else waits on
 * budget pressure that may never arrive.
 */
export async function evictSite(siteId: string): Promise<number> {
  if (isPrefetching(siteId)) {
    throw new Error('This project is being cached. Cancel that first.');
  }
  const index = await initPhotoCache();
  const urls = Object.entries(index.entries)
    .filter(([, entry]) => entry.siteId === siteId)
    .map(([url]) => url);
  const bytes = await _dropEntries(urls, [siteId]);
  console.log(`[PhotoPrefetch] Removed ${urls.length} photo(s), ${formatBytes(bytes)}, for site ${siteId}`);
  return bytes;
}

/**
 * Drop cached photos attributed to a project the device no longer holds.
 *
 * Sync's deletion reconciliation destroys local records for projects deleted on
 * the server, and nothing was reclaiming their photos: they sat under a siteId
 * that named nothing, waiting on a budget pressure that only arrives during a
 * prefetch. Run at app start, after the index loads.
 *
 * Deliberately conservative: if the sites table reads empty while the cache
 * holds photos, that is a device that has not synced yet, not a device with no
 * projects, and wiping the cache on that reading would be the worst possible
 * moment for it.
 */
export async function reclaimUnreferencedPhotos(): Promise<number> {
  if (_prefetchActive) return 0;
  try {
    const index = await initPhotoCache();
    const entries = Object.entries(index.entries);
    if (entries.length === 0) return 0;

    const sites = await getDatabase().get('sites').query().fetch();
    const live = new Set(sites.map(s => s.id));
    if (live.size === 0) {
      console.log('[PhotoPrefetch] No local projects yet — skipping reclaim');
      return 0;
    }

    const doomed = entries.filter(([, e]) => !live.has(e.siteId)).map(([url]) => url);
    const goneSites = [...new Set(
      entries.filter(([, e]) => !live.has(e.siteId)).map(([, e]) => e.siteId),
    )];
    if (doomed.length === 0) {
      // Recency records for projects that are gone cost nothing to keep, but
      // leaving them makes the eviction ordering read as if they still exist.
      const staleMeta = Object.keys(index.sites).filter(id => !live.has(id));
      if (staleMeta.length) {
        await _withIndex(i => { for (const id of staleMeta) delete i.sites[id]; });
      }
      return 0;
    }

    const bytes = await _dropEntries(doomed, []);
    await _withIndex(i => { for (const id of goneSites) delete i.sites[id]; });
    console.log(
      `[PhotoPrefetch] Reclaimed ${doomed.length} photo(s), ${formatBytes(bytes)}, ` +
      `from ${goneSites.length} project(s) no longer on this device`,
    );
    return bytes;
  } catch (e: any) {
    console.warn('[PhotoPrefetch] Reclaim failed:', e?.message ?? e);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/**
 * Delete files in the cache directory that no index entry names — .part files
 * from a run that was killed mid-flight, and files left by an index that was
 * cleared without the directory.
 */
export async function sweepOrphanFiles(opts?: { force?: boolean }): Promise<number> {
  // A sweep during a live run would delete the .part files it is writing.
  if (_prefetchActive && !opts?.force) return 0;
  try {
    const index = await initPhotoCache();
    const known = new Set(
      Object.values(index.entries).map(e => e.localPath.slice(CACHE_DIR.length)),
    );
    const names = await FileSystem.readDirectoryAsync(CACHE_DIR);
    let removed = 0;
    for (const name of names) {
      if (known.has(name)) continue;
      await FileSystem.deleteAsync(CACHE_DIR + name, { idempotent: true }).catch(() => undefined);
      removed++;
    }
    if (removed) console.log(`[PhotoPrefetch] Swept ${removed} orphan file(s)`);
    return removed;
  } catch (e: any) {
    console.warn('[PhotoPrefetch] Orphan sweep failed:', e?.message ?? e);
    return 0;
  }
}

/**
 * Empty the cache directory and the index. Photos then load from the network
 * again, exactly as they did before this service existed.
 */
export async function clearPhotoCache(): Promise<void> {
  await initPhotoCache();
  await _withIndex(index => {
    index.entries = {};
    index.sites = {};
  });
  await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true }).catch(() => undefined);
  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => undefined);
  console.log('[PhotoPrefetch] Cache cleared');
}

/** Human-readable byte count for the two places that show cache size. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
