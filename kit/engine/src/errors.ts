// Plain-worded error factories. Messages name the field or item and never
// carry stack traces or internal markers.

import type { EngineError } from "./types.js";

function build(
  message: string,
  field?: string,
  item?: string,
  position?: { line: number; column: number },
): EngineError {
  const error: EngineError = { message };
  if (field !== undefined) error.field = field;
  if (item !== undefined) error.item = item;
  if (position !== undefined) error.position = position;
  return error;
}

function where(field: string, item?: string): string {
  return item === undefined ? `"${field}"` : `"${field}" of "${item}"`;
}

/** The map text could not be read as JSON. */
export function notValidJson(
  position?: { line: number; column: number },
  field = "map",
): EngineError {
  const near =
    position === undefined
      ? ""
      : ` Look near line ${position.line}, column ${position.column}.`;
  return build(
    `The ${field} text is not valid JSON, so it cannot be read.${near}`,
    field,
    undefined,
    position,
  );
}

/** A value that must be an object is something else. */
export function notAnObject(field = "map", item?: string): EngineError {
  return build(`${where(field, item)} must be an object.`, field, item);
}

/** A required field is absent. */
export function missingField(field: string, item?: string): EngineError {
  return build(`${where(field, item)} is missing.`, field, item);
}

/** A field holds the wrong kind of value. */
export function wrongType(
  field: string,
  expected: string,
  item?: string,
): EngineError {
  return build(
    `${where(field, item)} must be ${expected}.`,
    field,
    item,
  );
}

/** Two entries share one identifier. */
export function duplicateId(field: string, id: string): EngineError {
  return build(
    `The id "${id}" is used more than once in "${field}". Each id must be unique.`,
    field,
    id,
  );
}

/** A field points to an id that does not exist. */
export function unknownReference(
  field: string,
  id: string,
  item?: string,
): EngineError {
  const owner = item === undefined ? "" : ` in "${item}"`;
  return build(
    `"${field}"${owner} refers to "${id}", which does not exist in this map.`,
    field,
    item ?? id,
  );
}

/** A number is outside what is allowed. `rule` is a plain phrase such as "greater than 0". */
export function outOfRange(
  field: string,
  rule: string,
  item?: string,
): EngineError {
  return build(`${where(field, item)} must be ${rule}.`, field, item);
}

/** The map file version is not one this engine can read. */
export function unsupportedVersion(
  found: number | string,
  supported: readonly number[],
): EngineError {
  return build(
    `"formatVersion" is "${String(found)}", which is not supported. Supported versions: ${supported.join(", ")}.`,
    "formatVersion",
    String(found),
  );
}

/** A call needs a map but none has been loaded. */
export function noMapLoaded(): EngineError {
  return build("No map is loaded yet. Load a map first.", "map");
}

/** An input to an engine call is unusable. `problem` is a plain phrase. */
export function badInput(
  input: string,
  problem = "must be a finite number",
): EngineError {
  return build(`The input "${input}" ${problem}.`, input);
}
