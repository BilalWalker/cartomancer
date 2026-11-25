// Map loader, step 1: parse the text, check the top level and the format
// version. Field checks and blocked roads are added in later steps.

import {
  missingField,
  notAnObject,
  notValidJson,
  unsupportedVersion,
  wrongType,
} from "./errors.js";
import { SUPPORTED_FORMAT_VERSIONS } from "./format.js";
import type { EngineError, EngineMap, LoadResult, MapFile } from "./types.js";

/** Top-level fields every map file must carry (the background picture is optional). */
const REQUIRED_FIELDS = [
  "nodes",
  "roads",
  "places",
  "blockedAreas",
  "props",
  "style",
] as const;

function lineAndColumn(
  text: string,
  offset: number,
): { line: number; column: number } {
  const end = Math.min(Math.max(offset, 0), text.length);
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: end - lastBreak };
}

/** Find where the JSON problem is, from the parser's own message. */
function problemPosition(
  text: string,
  failure: unknown,
): { line: number; column: number } | undefined {
  const message = failure instanceof Error ? failure.message : "";
  const lineColumn = /line (\d+) column (\d+)/.exec(message);
  if (lineColumn?.[1] !== undefined && lineColumn[2] !== undefined) {
    return {
      line: Number(lineColumn[1]),
      column: Number(lineColumn[2]),
    };
  }
  const offset = /position (\d+)/.exec(message);
  if (offset?.[1] !== undefined) {
    return lineAndColumn(text, Number(offset[1]));
  }
  if (message.includes("end of JSON") || message.includes("end of data")) {
    return lineAndColumn(text, text.length);
  }
  return undefined;
}

/** Read map file text. Returns a map with notices, or errors and no map. */
export function parseMap(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (failure) {
    return { errors: [notValidJson(problemPosition(text, failure))] };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { errors: [notAnObject("map")] };
  }
  const data = raw as Record<string, unknown>;

  // The format version is read before any other field.
  if (!("formatVersion" in data) || data["formatVersion"] === undefined) {
    return { errors: [missingField("formatVersion")] };
  }
  const version = data["formatVersion"];
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return { errors: [wrongType("formatVersion", "a whole number")] };
  }
  if (!(SUPPORTED_FORMAT_VERSIONS as readonly number[]).includes(version)) {
    return {
      errors: [unsupportedVersion(version, SUPPORTED_FORMAT_VERSIONS)],
    };
  }

  const errors: EngineError[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (!(field in data) || data[field] === undefined) {
      errors.push(missingField(field));
    }
  }
  if (errors.length > 0) return { errors };

  // Field checks arrive in a later step; roads are all usable for now.
  const file = data as unknown as MapFile;
  const map: EngineMap = {
    ...file,
    usableRoadIds: new Set(
      Array.isArray(file.roads) ? file.roads.map((road) => road.id) : [],
    ),
    blockedRoads: [],
  };
  return { map, notices: [] };
}
