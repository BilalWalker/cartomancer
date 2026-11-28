// Reduced motion reader: turns a media query object into the reduced-motion
// service the Mount_Functions take. No browser global is read here; the page
// passes `window.matchMedia(REDUCED_MOTION_QUERY)`.

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** The parts of a MediaQueryList this reader uses. */
export interface MediaQueryLike {
  readonly matches: boolean;
  addEventListener?(type: "change", listener: () => void): void;
  removeEventListener?(type: "change", listener: () => void): void;
  /** Older browsers. */
  addListener?(listener: () => void): void;
  removeListener?(listener: () => void): void;
}

/** The shape of `MountServices["matchReducedMotion"]` in the engine. */
export interface ReducedMotionHandle {
  readonly matches: boolean;
  addListener(callback: () => void): void;
  removeListener(callback: () => void): void;
}

/** A live reduced-motion reader over an injected media query object. */
export function createReducedMotion(query: MediaQueryLike): ReducedMotionHandle {
  return {
    get matches(): boolean {
      return query.matches === true;
    },
    addListener(callback: () => void): void {
      if (typeof query.addEventListener === "function") query.addEventListener("change", callback);
      else query.addListener?.(callback);
    },
    removeListener(callback: () => void): void {
      if (typeof query.removeEventListener === "function") query.removeEventListener("change", callback);
      else query.removeListener?.(callback);
    },
  };
}

/** The service to pass as `services.matchReducedMotion` to a Mount_Function. */
export function reducedMotionService(query: MediaQueryLike): () => ReducedMotionHandle {
  return () => createReducedMotion(query);
}
