import { describe, expect, it } from "vitest";
import {
  asImageHandle,
  pictureRefOfKind,
  resolvePicture,
  type ImageEntry,
} from "../../src/views/image-lookup";

const handle = asImageHandle({ pixels: "stand-in" });
const good: ImageEntry = { image: handle, width: 10, height: 20 };

function missingOf(result: ReturnType<typeof resolvePicture>) {
  expect("missing" in result).toBe(true);
  return "missing" in result ? result.missing : undefined;
}

describe("pictureRefOfKind", () => {
  it("strips exactly one prefix", () => {
    expect(pictureRefOfKind("picture:a")).toBe("a");
    expect(pictureRefOfKind("upload:b")).toBe("b");
    expect(pictureRefOfKind("picture:a:b")).toBe("a:b");
    expect(pictureRefOfKind("picture:picture:x")).toBe("picture:x");
  });
  it("returns an empty reference for a bare prefix", () => {
    expect(pictureRefOfKind("picture:")).toBe("");
    expect(pictureRefOfKind("upload:")).toBe("");
  });
  it("returns undefined for other kinds", () => {
    expect(pictureRefOfKind("tree")).toBeUndefined();
    expect(pictureRefOfKind("Picture:a")).toBeUndefined();
    expect(pictureRefOfKind("")).toBeUndefined();
  });
});

describe("asImageHandle", () => {
  it("is the identity", () => {
    const source = {};
    expect(asImageHandle(source)).toBe(source);
  });
});

describe("resolvePicture", () => {
  it("returns the entry from an object lookup", () => {
    const result = resolvePicture({ a: good }, "a");
    expect(result).toEqual({ entry: good });
    expect("entry" in result && result.entry.image).toBe(handle);
  });
  it("returns the entry from a function lookup", () => {
    const calls: string[] = [];
    const result = resolvePicture((ref) => {
      calls.push(ref);
      return good;
    }, "x");
    expect(result).toEqual({ entry: good });
    expect(calls).toEqual(["x"]);
  });
  it("is missing without a Notice when no lookup is given", () => {
    expect(missingOf(resolvePicture(undefined, "a"))).toBeUndefined();
  });
  it("is missing without a Notice when the reference has no entry", () => {
    expect(missingOf(resolvePicture({ a: good }, "b"))).toBeUndefined();
    expect(missingOf(resolvePicture(() => undefined, "b"))).toBeUndefined();
    expect(missingOf(resolvePicture({ a: undefined }, "a"))).toBeUndefined();
  });
  it("reads an object lookup with an own-property check", () => {
    for (const ref of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(missingOf(resolvePicture({}, ref))).toBeUndefined();
    }
  });
  it("is missing with a Notice naming the reference when the lookup throws", () => {
    const throwing = () => {
      throw new Error("boom");
    };
    const note = missingOf(resolvePicture(throwing, "clinic"));
    expect(note?.message).toContain("clinic");
    expect(note?.message).not.toContain("boom");
  });
  it("is missing with a Notice when the image is undefined or null", () => {
    for (const image of [undefined, null]) {
      const entry = { image, width: 1, height: 1 } as unknown as ImageEntry;
      const note = missingOf(resolvePicture({ a: entry }, "a"));
      expect(note?.message).toContain('"a"');
    }
  });
  it("is missing with a Notice when the entry is not an object", () => {
    const note = missingOf(
      resolvePicture({ a: 5 as unknown as ImageEntry }, "a"),
    );
    expect(note?.message).toContain('"a"');
  });
  it("is missing with a Notice when reading the entry throws", () => {
    const entry = new Proxy(
      {},
      {
        get() {
          throw new Error("no");
        },
      },
    ) as ImageEntry;
    const note = missingOf(resolvePicture({ a: entry }, "a"));
    expect(note?.message).toContain('"a"');
  });
  it("accepts a falsy but present image such as 0", () => {
    const entry = { image: 0, width: 1, height: 1 } as unknown as ImageEntry;
    expect("entry" in resolvePicture({ a: entry }, "a")).toBe(true);
  });

  describe("entry size boundaries", () => {
    const bad = [0, -1, Number.NaN, Infinity, -Infinity];
    for (const value of bad) {
      it(`rejects a width of ${value}`, () => {
        const entry = { image: handle, width: value, height: 5 };
        const note = missingOf(resolvePicture({ pic: entry }, "pic"));
        expect(note?.message).toContain('"pic"');
      });
      it(`rejects a height of ${value}`, () => {
        const entry = { image: handle, width: 5, height: value };
        const note = missingOf(resolvePicture({ pic: entry }, "pic"));
        expect(note?.message).toContain('"pic"');
      });
    }
    it("accepts a size just above 0", () => {
      const entry = { image: handle, width: Number.MIN_VALUE, height: 1e-9 };
      expect("entry" in resolvePicture({ pic: entry }, "pic")).toBe(true);
    });
    it("accepts a large finite size", () => {
      const entry = { image: handle, width: Number.MAX_VALUE, height: 1 };
      expect("entry" in resolvePicture({ pic: entry }, "pic")).toBe(true);
    });
  });
});
