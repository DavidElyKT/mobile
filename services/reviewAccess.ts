/**
 * Which projects this device's user may sign off on, cached for offline use.
 *
 * Review authority used to be `role === 'Administrator'`, which the app already
 * held locally in the user profile. Since migration 047 it is also a list of
 * per-project grants that lives on the server, and this app has to work in a
 * factory with no signal — so the list is fetched when we can and cached, and
 * the cache is what the screens read.
 *
 * TWO KINDS OF ANSWER, and the difference is why this is not simply a fetch:
 *
 *   * An Administrator reviews everything, and `role` is already on the local
 *     profile. That answer needs no network and never goes stale offline.
 *   * A grant holder's list does need the network. Cached per user oid, so
 *     switching accounts on a shared tablet cannot inherit the last person's
 *     authority.
 *
 * STALENESS IS A REAL TRADE AND IT IS DELIBERATE. A grant revoked while the
 * device is offline still reads as granted here until the next successful
 * fetch. That is acceptable because the server re-checks every write: a stale
 * cache lets the app OFFER a control that the API will then refuse, which is a
 * confusing moment rather than an authority leak. The reverse default — no
 * authority until confirmed — would strand a reviewer mid-visit, which is the
 * one thing an offline-first app must not do.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { UsersApi } from './api';

const KEY_PREFIX = 'review_access:';

export interface ReviewAccess {
  /** True for an Administrator. */
  all: boolean;
  /** Projects granted to this user. Empty when `all` is true. */
  projectIds: number[];
}

const NONE: ReviewAccess = { all: false, projectIds: [] };

function key(oid: string): string {
  return `${KEY_PREFIX}${oid}`;
}

/** The cached answer for this user, or null if nothing has been cached yet. */
export async function loadReviewAccess(oid: string): Promise<ReviewAccess | null> {
  if (!oid) return null;
  try {
    const raw = await AsyncStorage.getItem(key(oid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      all: parsed?.all === true,
      projectIds: Array.isArray(parsed?.projectIds)
        ? parsed.projectIds.filter((id: unknown) => typeof id === 'number')
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Fetch and cache. Returns the cached answer unchanged on failure rather than
 * clearing it: a flaky connection must not cost a reviewer their controls.
 */
export async function refreshReviewAccess(
  oid: string,
  token: string,
): Promise<ReviewAccess> {
  const cached = (await loadReviewAccess(oid)) ?? NONE;
  if (!oid || !token) return cached;
  try {
    const response = await UsersApi.reviewAccess(token);
    const access: ReviewAccess = {
      all: response?.all === true,
      projectIds: Array.isArray(response?.project_ids) ? response.project_ids : [],
    };
    await AsyncStorage.setItem(key(oid), JSON.stringify(access));
    return access;
  } catch {
    return cached;
  }
}

export async function clearReviewAccess(oid: string): Promise<void> {
  if (!oid) return;
  try {
    await AsyncStorage.removeItem(key(oid));
  } catch {
    /* nothing to do — the next sign-in overwrites it anyway */
  }
}

/**
 * May this user sign off on this project?
 *
 * The role short-circuit is here rather than on the server's answer because it
 * is the one part that works offline from day one: an Administrator's authority
 * is already on the local profile and does not depend on a cached fetch.
 */
export function canReviewProject(
  role: string | null | undefined,
  access: ReviewAccess | null,
  siteId: number | null | undefined,
): boolean {
  if (role === 'Administrator') return true;
  if (!access) return false;
  if (access.all) return true;
  if (siteId === null || siteId === undefined) return false;
  return access.projectIds.includes(siteId);
}
