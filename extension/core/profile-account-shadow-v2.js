// Verified, bounded client cache for Package G. No product path consumes this key yet.

import { runStorageMutation } from '../infra/storage-budget.js';
import { hashDeviceAccountValue } from './device-account-v2.js';

export const PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY = 'profile_account_v2_shadow_cache';

function sumBuckets(entries, keyName) {
  const map = new Map();
  for (const entry of entries || []) {
    const key = keyName === 'channelMode' ? `${entry.channel}\u0000${entry.mode}` : entry.quotaBucket;
    map.set(key, (map.get(key) || 0) + Number(entry.durationSeconds || 0));
  }
  return map;
}

function mapsEqual(left, right) {
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of keys) if ((left.get(key) || 0) !== (right.get(key) || 0)) return false;
  return true;
}

export async function validateProfileAccountSnapshotPages(pages) {
  if (!Array.isArray(pages) || pages.length === 0) throw new Error('PROFILE_ACCOUNT_SNAPSHOT_EMPTY');
  const first = pages[0];
  const pageCount = Number(first.pageCount);
  if (!first.snapshotId || !Number.isSafeInteger(pageCount) || pageCount !== pages.length) {
    throw new Error('PROFILE_ACCOUNT_SNAPSHOT_INCOMPLETE');
  }
  const ordered = [...pages].sort((left, right) => Number(left.page) - Number(right.page));
  const deviceAccounts = [];
  for (let index = 0; index < ordered.length; index++) {
    const page = ordered[index];
    if (page.snapshotId !== first.snapshotId || page.snapshotHash !== first.snapshotHash || Number(page.page) !== index ||
        Number(page.pageCount) !== pageCount || page.totalHash !== first.totalHash) {
      throw new Error('PROFILE_ACCOUNT_SNAPSHOT_PAGE_MISMATCH');
    }
    const payload = { page: index, deviceAccounts: Array.isArray(page.deviceAccounts) ? page.deviceAccounts : [] };
    if (await hashDeviceAccountValue(payload) !== page.pageHash || first.pageHashes?.[index] !== page.pageHash) {
      throw new Error('PROFILE_ACCOUNT_SNAPSHOT_PAGE_HASH_MISMATCH');
    }
    deviceAccounts.push(...payload.deviceAccounts);
  }
  const metadata = {
    schemaVersion: first.schemaVersion,
    period: first.period,
    sourceGeneration: first.sourceGeneration,
    asOf: first.asOf,
    dayVersionVector: first.dayVersionVector,
    deviceVersionVector: first.deviceVersionVector,
    profileTotal: first.profileTotal,
    completeness: first.completeness,
    totalHash: first.totalHash,
    pageCount: first.pageCount,
    pageHashes: first.pageHashes,
  };
  if (await hashDeviceAccountValue(metadata) !== first.snapshotHash) {
    throw new Error('PROFILE_ACCOUNT_SNAPSHOT_HASH_MISMATCH');
  }
  const deviceTotalSeconds = deviceAccounts.reduce((sum, account) => sum + Number(account?.total?.totalSeconds || 0), 0);
  if (deviceTotalSeconds !== Number(first.profileTotal?.totalSeconds || 0)) {
    throw new Error('PROFILE_ACCOUNT_SNAPSHOT_TOTAL_MISMATCH');
  }
  const deviceChannelMode = new Map();
  const deviceQuota = new Map();
  for (const account of deviceAccounts) {
    for (const [key, value] of sumBuckets(account?.total?.byChannelMode, 'channelMode')) {
      deviceChannelMode.set(key, (deviceChannelMode.get(key) || 0) + value);
    }
    for (const [key, value] of sumBuckets(account?.total?.byQuotaBucket, 'quotaBucket')) {
      deviceQuota.set(key, (deviceQuota.get(key) || 0) + value);
    }
  }
  if (!mapsEqual(deviceChannelMode, sumBuckets(first.profileTotal?.byChannelMode, 'channelMode')) ||
      !mapsEqual(deviceQuota, sumBuckets(first.profileTotal?.byQuotaBucket, 'quotaBucket'))) {
    throw new Error('PROFILE_ACCOUNT_SNAPSHOT_BUCKET_MISMATCH');
  }
  return {
    schemaVersion: 2,
    snapshotId: first.snapshotId,
    snapshotHash: first.snapshotHash,
    createdAt: first.createdAt,
    expiresAt: first.expiresAt,
    period: first.period,
    sourceGeneration: first.sourceGeneration,
    asOf: first.asOf,
    dayVersionVector: first.dayVersionVector,
    deviceVersionVector: first.deviceVersionVector,
    deviceAccounts,
    profileTotal: first.profileTotal,
    completeness: first.completeness,
    totalHash: first.totalHash,
    verifiedAt: Date.now(),
  };
}

export async function storeProfileAccountShadowSnapshot(snapshot) {
  return runStorageMutation(async (storage) => {
    const data = await storage.get(PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY);
    const previous = data[PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY]?.current || null;
    const cache = {
      schemaVersion: 1,
      current: snapshot,
      previous: previous && previous.snapshotId !== snapshot.snapshotId ? {
        snapshotId: previous.snapshotId,
        snapshotHash: previous.snapshotHash,
        period: previous.period,
        asOf: previous.asOf,
        totalHash: previous.totalHash,
        profileTotal: previous.profileTotal,
        completeness: previous.completeness,
        replacedAt: Date.now(),
      } : null,
    };
    await storage.set({ [PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY]: cache }, {
      priority: 'sync', source: 'profile_account_v2_shadow_cache',
    });
    return cache;
  }, { priority: 'sync', source: 'profile_account_v2_shadow_cache' });
}

