// Picture lookup for the Views. The Views never load pictures; the caller
// gives a lookup from a reference to an already loaded picture. Nothing here
// throws and nothing reads inside a picture handle.

import type { ImageHandle } from "./canvas-interface.js";
import { notice, type Notice } from "./view-errors.js";

export type { ImageHandle };

/** A loaded picture and its size in pixels (each above 0). */
export interface ImageEntry {
  image: ImageHandle;
  width: number;
  height: number;
}

/** A lookup from a picture reference to its entry: an object or a function. */
export type ImageLookup =
  | Readonly<Record<string, ImageEntry | undefined>>
  | ((ref: string) => ImageEntry | undefined);

/** Marks a caller's loaded picture as a handle. Identity; nothing is read. */
export function asImageHandle(source: unknown): ImageHandle {
  return source as ImageHandle;
}

const PREFIXES = ["picture:", "upload:"];

/** The text after exactly one `picture:` or `upload:` prefix; undefined for other kinds. */
export function pictureRefOfKind(kind: string): string | undefined {
  for (const prefix of PREFIXES) {
    if (kind.startsWith(prefix)) return kind.slice(prefix.length);
  }
  return undefined;
}

/** Every Picture_Prop reference and the background `ref` of a map, each once, in order. */
export function collectPictureReferences(map: {
  props: readonly { kind: string }[];
  backgroundPicture?: { ref: string };
}): string[] {
  const seen = new Set<string>();
  if (map.backgroundPicture !== undefined) seen.add(map.backgroundPicture.ref);
  for (const prop of map.props) {
    const ref = pictureRefOfKind(prop.kind);
    if (ref !== undefined) seen.add(ref);
  }
  return [...seen];
}

const handleIds = new WeakMap<object, number>();
let nextHandleId = 1;

function handleIdentity(image: unknown): string {
  if ((typeof image === "object" && image !== null) || typeof image === "function") {
    let id = handleIds.get(image as object);
    if (id === undefined) {
      id = nextHandleId++;
      handleIds.set(image as object, id);
    }
    return `h${id}`;
  }
  return `v${typeof image}:${String(image)}`;
}

/**
 * A text that changes when a looked-up picture arrives, goes away, or changes
 * handle or size. Empty for no references; no lookup is made then. A lookup
 * that throws counts as missing.
 */
export function buildImagesSignature(
  references: readonly string[],
  images: ImageLookup | undefined,
): string {
  if (references.length === 0) return "";
  const parts: string[] = [];
  for (const ref of new Set(references)) {
    const result = resolvePicture(images, ref);
    const state =
      "entry" in result
        ? `${handleIdentity(result.entry.image)},${result.entry.width},${result.entry.height}`
        : "missing";
    parts.push(`${JSON.stringify(ref)}=${state}`);
  }
  return parts.join(";");
}

export type ResolvedPicture =
  | { entry: ImageEntry }
  | { missing: Notice | undefined };

function isUsableSize(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** A resolver that looks up each reference at most once per frame. */
export type PictureResolver = (ref: string) => ResolvedPicture;

/**
 * Makes a per-frame resolver over `resolvePicture`. The first call for a
 * reference makes the one lookup and returns its Notice; later calls for the
 * same reference return the same answer without the Notice, so one frame
 * reports one Notice per reference.
 */
export function createPictureResolver(images: ImageLookup | undefined): PictureResolver {
  const memo = new Map<string, ResolvedPicture>();
  return (ref) => {
    const seen = memo.get(ref);
    if (seen !== undefined) return "entry" in seen ? seen : { missing: undefined };
    const result = resolvePicture(images, ref);
    memo.set(ref, result);
    return result;
  };
}

/**
 * Finds the picture for a reference. Never throws. Returns an entry only when
 * the lookup gives an object with an image and a finite size above 0.
 * Otherwise returns `missing`; a Notice is given when the lookup threw or the
 * entry is unusable, and none when there is simply no entry (the caller
 * words that case itself).
 */
export function resolvePicture(
  images: ImageLookup | undefined,
  ref: string,
): ResolvedPicture {
  if (images === undefined || images === null) return { missing: undefined };
  let found: unknown;
  try {
    if (typeof images === "function") {
      found = images(ref);
    } else if (Object.prototype.hasOwnProperty.call(images, ref)) {
      found = (images as Record<string, unknown>)[ref];
    } else {
      return { missing: undefined };
    }
  } catch {
    return {
      missing: notice(
        `The picture "${ref}" could not be looked up, so it is treated as missing.`,
      ),
    };
  }
  if (found === undefined || found === null) return { missing: undefined };
  if (typeof found !== "object") {
    return {
      missing: notice(
        `The picture "${ref}" has no usable entry, so it is treated as missing.`,
      ),
    };
  }
  let image: unknown;
  let width: unknown;
  let height: unknown;
  try {
    const record = found as Record<string, unknown>;
    image = record.image;
    width = record.width;
    height = record.height;
  } catch {
    return {
      missing: notice(
        `The picture "${ref}" could not be read, so it is treated as missing.`,
      ),
    };
  }
  if (image === undefined || image === null) {
    return {
      missing: notice(
        `The picture "${ref}" has no image, so it is treated as missing.`,
      ),
    };
  }
  if (!isUsableSize(width) || !isUsableSize(height)) {
    return {
      missing: notice(
        `The picture "${ref}" has no usable size, so it is treated as missing.`,
      ),
    };
  }
  return {
    entry: { image: image as ImageHandle, width: width as number, height: height as number },
  };
}
