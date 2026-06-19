/**
 * Offline photo upload queue.
 *
 * Photos are saved to local storage immediately on capture and queued here.
 * processPhotoQueue() is called at the start of every sync, before the
 * structured data push, so blob URLs are set on records before their rows
 * are sent to the server.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from '@/db';
import { SyncApi } from './api';

const QUEUE_KEY = 'photo_upload_queue';

export interface PhotoQueueEntry {
  localUri: string;   // file:// path of the saved photo
  collection: string; // WatermelonDB collection name, e.g. 'assemblies'
  recordId: string;   // local WatermelonDB UUID of the record
  field: string;      // snake_case column name, e.g. 'picture_url'
}

/** Add or replace a photo entry for a given record + field. */
export async function enqueuePhoto(entry: PhotoQueueEntry): Promise<void> {
  if (!entry.localUri.startsWith('file://')) return; // already a blob URL — nothing to queue
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: PhotoQueueEntry[] = raw ? JSON.parse(raw) : [];
  // Replace any existing entry for the same record + field
  const filtered = queue.filter(
    e => !(e.recordId === entry.recordId && e.field === entry.field),
  );
  filtered.push(entry);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

/**
 * Upload all queued photos to Azure Blob Storage and update WatermelonDB
 * records with the resulting blob URLs.
 *
 * Each entry is removed from the queue immediately after a successful upload
 * so the queue stays consistent if the app is killed mid-run.
 * Failed entries remain in the queue and are retried on the next sync.
 */
export async function processPhotoQueue(
  getAccessToken: () => Promise<string | null>,
): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: PhotoQueueEntry[] = raw ? JSON.parse(raw) : [];
  if (queue.length === 0) return;

  console.log(`[PhotoQueue] Processing ${queue.length} queued photo(s)`);
  const token = await getAccessToken();
  if (!token) throw new Error('SYNC_AUTH_REQUIRED:photo_queue');
  const db = getDatabase();

  for (const entry of [...queue]) {
    try {
      // Verify the local file still exists
      const info = await FileSystem.getInfoAsync(entry.localUri);
      if (!info.exists) {
        console.warn(`[PhotoQueue] File gone, dropping: ${entry.localUri}`);
        await _clearStaleLocalPhotoRef(entry, db);
        await _removeFromQueue(entry);
        continue;
      }

      // Infer MIME type and filename from local URI extension
      const ext = entry.localUri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
      const isPdf = ext === 'pdf';
      const filename = isPdf ? `floor_plan_${Date.now()}.pdf` : `photo_${Date.now()}.jpg`;
      const contentType = isPdf ? 'application/pdf' : 'image/jpeg';
      console.log(`[PhotoQueue] Uploading ${entry.collection}.${entry.field} (${entry.recordId}) as ${contentType}`);
      const base64 = await FileSystem.readAsStringAsync(entry.localUri, {
        encoding: 'base64',
      });
      const { url: blob_url } = await SyncApi.uploadPhoto(
        token,
        filename,
        contentType,
        base64,
      );
      console.log(`[PhotoQueue] Uploaded → ${blob_url}`);

      // Update the WatermelonDB record with the blob URL
      try {
        const record = (await db.get(entry.collection).find(entry.recordId)) as any;
        await db.write(async () => {
          await record.update((r: any) => {
            r._raw[entry.field] = blob_url;
            r.isSynced = false; // push will send the blob URL to the server
          });
        });
      } catch {
        // Record was deleted — nothing to update; still clean up the local file
      }

      await FileSystem.deleteAsync(entry.localUri, { idempotent: true });
      await _removeFromQueue(entry);
    } catch (e: any) {
      console.warn(`[PhotoQueue] Upload failed for ${entry.collection}.${entry.field}:`, e?.message ?? e);
      // Leave in queue — will retry on next sync
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function _removeFromQueue(entry: PhotoQueueEntry): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: PhotoQueueEntry[] = raw ? JSON.parse(raw) : [];
  const updated = queue.filter(
    e =>
      !(
        e.recordId === entry.recordId &&
        e.field === entry.field &&
        e.localUri === entry.localUri
      ),
  );
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
}

async function _clearStaleLocalPhotoRef(
  entry: PhotoQueueEntry,
  db: ReturnType<typeof getDatabase>,
): Promise<void> {
  try {
    const record = (await db.get(entry.collection).find(entry.recordId)) as any;
    await db.write(async () => {
      await record.update((r: any) => {
        if (r._raw[entry.field] === entry.localUri) {
          r._raw[entry.field] = null;
          r.isSynced = false;
        }
      });
    });
  } catch {
    // record missing or update race — nothing to repair
  }
}
