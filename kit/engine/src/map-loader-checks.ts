// Field checks used by the map loader. Each check takes raw parsed JSON and
// returns every problem it finds, never stopping at the first one.

import {
  duplicateId,
  missingField,
  notAnObject,
  outOfRange,
  unknownReference,
  wrongType,
} from "./errors.js";
import type { EngineError } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Checks the node list: every node is an object with a unique non-empty
 * string id and finite numeric x and y.
 */
export function checkNodes(raw: unknown): EngineError[] {
  if (!Array.isArray(raw)) {
    return [wrongType("nodes", "a list")];
  }
  const errors: EngineError[] = [];
  const seen = new Set<string>();
  raw.forEach((entry: unknown, index: number) => {
    const label = `node ${index + 1}`;
    if (!isRecord(entry)) {
      errors.push(notAnObject("nodes", label));
      return;
    }
    const id = entry["id"];
    let item = label;
    if (id === undefined) {
      errors.push(missingField("id", label));
    } else if (typeof id !== "string" || id === "") {
      errors.push(wrongType("id", "a non-empty text", label));
    } else {
      item = id;
      if (seen.has(id)) {
        errors.push(duplicateId("nodes", id));
      }
      seen.add(id);
    }
    for (const axis of ["x", "y"] as const) {
      const value = entry[axis];
      if (value === undefined) {
        errors.push(missingField(axis, item));
      } else if (typeof value !== "number") {
        errors.push(wrongType(axis, "a number", item));
      } else if (!isFiniteNumber(value)) {
        errors.push(outOfRange(axis, "a finite number", item));
      }
    }
  });
  return errors;
}

const ROAD_KINDS = ["main", "side", "footpath", "corridor"];

/**
 * Checks the road list: every road has a unique non-empty string id, two
 * different existing node ids (`fromNodeId`, `toNodeId`), a width above zero,
 * a kind of main, side, footpath or corridor, and, when present, a boolean
 * `oneWay` flag. `nodeIds` holds the ids of the nodes in the map.
 */
export function checkRoads(
  raw: unknown,
  nodeIds: ReadonlySet<string>,
): EngineError[] {
  if (!Array.isArray(raw)) {
    return [wrongType("roads", "a list")];
  }
  const errors: EngineError[] = [];
  const seen = new Set<string>();
  raw.forEach((entry: unknown, index: number) => {
    const label = `road ${index + 1}`;
    if (!isRecord(entry)) {
      errors.push(notAnObject("roads", label));
      return;
    }
    const id = entry["id"];
    let item = label;
    if (id === undefined) {
      errors.push(missingField("id", label));
    } else if (typeof id !== "string" || id === "") {
      errors.push(wrongType("id", "a non-empty text", label));
    } else {
      item = id;
      if (seen.has(id)) {
        errors.push(duplicateId("roads", id));
      }
      seen.add(id);
    }

    const ends: string[] = [];
    for (const field of ["fromNodeId", "toNodeId"] as const) {
      const value = entry[field];
      if (value === undefined) {
        errors.push(missingField(field, item));
      } else if (typeof value !== "string" || value === "") {
        errors.push(wrongType(field, "a non-empty text", item));
      } else if (!nodeIds.has(value)) {
        errors.push(unknownReference(field, value, item));
      } else {
        ends.push(value);
      }
    }
    if (ends.length === 2 && ends[0] === ends[1]) {
      errors.push(
        outOfRange("toNodeId", 'different from "fromNodeId"', item),
      );
    }

    const width = entry["width"];
    if (width === undefined) {
      errors.push(missingField("width", item));
    } else if (typeof width !== "number") {
      errors.push(wrongType("width", "a number", item));
    } else if (!isFiniteNumber(width) || width <= 0) {
      errors.push(outOfRange("width", "a finite number greater than 0", item));
    }

    const kind = entry["kind"];
    if (kind === undefined) {
      errors.push(missingField("kind", item));
    } else if (typeof kind !== "string" || !ROAD_KINDS.includes(kind)) {
      errors.push(
        outOfRange("kind", "one of main, side, footpath or corridor", item),
      );
    }

    const oneWay = entry["oneWay"];
    if (oneWay !== undefined && typeof oneWay !== "boolean") {
      errors.push(wrongType("oneWay", "true or false", item));
    }
  });
  return errors;
}

/**
 * Checks the place list: every place has a unique non-empty string id, a
 * non-empty text name and category, and finite numeric x and y.
 */
export function checkPlaces(raw: unknown): EngineError[] {
  if (!Array.isArray(raw)) {
    return [wrongType("places", "a list")];
  }
  const errors: EngineError[] = [];
  const seen = new Set<string>();
  raw.forEach((entry: unknown, index: number) => {
    const label = `place ${index + 1}`;
    if (!isRecord(entry)) {
      errors.push(notAnObject("places", label));
      return;
    }
    const id = entry["id"];
    let item = label;
    if (id === undefined) {
      errors.push(missingField("id", label));
    } else if (typeof id !== "string" || id === "") {
      errors.push(wrongType("id", "a non-empty text", label));
    } else {
      item = id;
      if (seen.has(id)) {
        errors.push(duplicateId("places", id));
      }
      seen.add(id);
    }
    for (const field of ["name", "category"] as const) {
      const value = entry[field];
      if (value === undefined) {
        errors.push(missingField(field, item));
      } else if (typeof value !== "string" || value === "") {
        errors.push(wrongType(field, "a non-empty text", item));
      }
    }
    for (const axis of ["x", "y"] as const) {
      const value = entry[axis];
      if (value === undefined) {
        errors.push(missingField(axis, item));
      } else if (typeof value !== "number") {
        errors.push(wrongType(axis, "a number", item));
      } else if (!isFiniteNumber(value)) {
        errors.push(outOfRange(axis, "a finite number", item));
      }
    }
  });
  return errors;
}
