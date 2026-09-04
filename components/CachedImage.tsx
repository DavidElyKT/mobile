/**
 * The one <Image> every server photo is shown through.
 *
 * It asks services/photoPrefetch for a cached local path and falls back to the
 * URL when there is not one, which is what turns cached_photos/ from a
 * directory of files nobody reads into photos that appear on a shop floor with
 * no signal.
 *
 * A 13th <Image source={{ uri }}> pointing at a server photo is a bug — use
 * this instead. Local file:// paths (a photo just captured, still queued for
 * upload) can safely go through it too: they are never in the index, so they
 * pass straight through.
 */

import { useEffect, useState } from 'react';
import { Image, type ImageProps } from 'react-native';
import {
  forgetCachedUrl,
  initPhotoCache,
  resolveCachedUri,
  subscribeCache,
} from '@/services/photoPrefetch';

/**
 * Resolve a photo URL to a cached local path when one exists.
 *
 * Re-resolves when the index finishes loading and whenever it changes, so a
 * screen open during a prefetch swaps to the local file as it lands.
 */
export function useCachedUri(uri: string | null | undefined): string | null | undefined {
  const [resolved, setResolved] = useState(() => resolveCachedUri(uri));

  useEffect(() => {
    let alive = true;
    const reresolve = () => { if (alive) setResolved(resolveCachedUri(uri)); };
    reresolve();
    void initPhotoCache().then(reresolve).catch(() => undefined);
    const unsubscribe = subscribeCache(reresolve);
    return () => { alive = false; unsubscribe(); };
  }, [uri]);

  return resolved;
}

interface Props extends Omit<ImageProps, 'source'> {
  uri: string | null | undefined;
}

export default function CachedImage({ uri, onError, ...rest }: Props) {
  const resolved = useCachedUri(uri);

  return (
    <Image
      {...rest}
      source={{ uri: resolved ?? '' }}
      onError={event => {
        // The index claims a file the device no longer has — app data cleared,
        // or the OS reclaimed it. Drop the entry so the next render goes to the
        // network instead of showing a permanently broken image.
        if (uri && resolved && resolved !== uri) void forgetCachedUrl(uri);
        onError?.(event);
      }}
    />
  );
}
