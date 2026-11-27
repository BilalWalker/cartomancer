// Plain-worded View_Error and Notice factories. Messages name the input and
// the allowed range, never carry the rejected values, and never carry stack
// traces or internal markers.

/** A rejected input of a View call. The previous state is kept. */
export interface ViewError {
  /** Plain words; names the input and its allowed range or rule. */
  message: string;
  /** The name of the input that was rejected. */
  field?: string;
}

/** A condition a View reports without stopping. */
export interface Notice {
  /** Plain words; names the input, item or key. */
  message: string;
}

function error(message: string, field?: string): ViewError {
  const result: ViewError = { message };
  if (field !== undefined) result.field = field;
  return result;
}

/** True when the value is a ViewError (it has a string message and no `kind` of a result). */
export function isViewError(value: unknown): value is ViewError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/** A plain-worded Notice. */
export function notice(message: string): Notice {
  return { message };
}

/** A number input is not finite. */
export function badNumber(input: string): ViewError {
  return error(`The input "${input}" must be a finite number.`, input);
}

/** A number input is finite but outside its range. `rule` is a plain phrase such as "from 0.001 to 1000". */
export function outOfRange(input: string, rule: string): ViewError {
  return error(`The input "${input}" must be ${rule}.`, input);
}

/** A point input lacks a finite x or y. The coordinates are not repeated. */
export function badPoint(input: string): ViewError {
  return error(
    `The point "${input}" must have a finite x value and a finite y value.`,
    input,
  );
}

/** A size input is outside its range, in CSS pixels. */
export function badSize(input: string, min: number, max: number): ViewError {
  return error(
    `The size "${input}" must be a number from ${min} to ${max} CSS pixels.`,
    input,
  );
}

/** The canvas has no 2D drawing context. */
export function noContext(): ViewError {
  return error(
    "The canvas offers no 2D drawing, so no view was mounted.",
    "canvas",
  );
}

/** The first argument of a Mount_Function is not a canvas element. */
export function notACanvas(): ViewError {
  return error(
    'The input "canvas" must be a canvas element, so no view was mounted.',
    "canvas",
  );
}

/** The engine argument lacks a function the View reads. */
export function missingEngineFunction(name: string): ViewError {
  return error(
    `The input "engine" must offer the function "${name}", so no view was mounted.`,
    "engine",
  );
}

/** A control was used after destroy(). */
export function destroyed(): ViewError {
  return error(
    "The view has been destroyed, so this control does nothing.",
    "view",
  );
}

/** A drawing call was skipped because a number was not finite. */
export function skippedDrawing(operation: string): Notice {
  return notice(
    `The drawing operation "${operation}" was skipped because a number was not finite.`,
  );
}
