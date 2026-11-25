// Field checks used by the map loader. Each check takes raw parsed JSON and
// returns every problem it finds, never stopping at the first one.

import {
  duplicateId,
  missingField,
  notAnObject,
  outOfRange,
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
