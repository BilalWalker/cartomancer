// Fault injector for the map loader tests. It takes a valid map file and one
// named fault, and returns the broken text together with the field (and, where
// the loader names one, the item) that the loader must report.
//
// When the file has no item the fault needs (for example no road), a valid
// item is added first, so every fault can be applied to every generated file.

import type { MapFile } from "../../src/types.js";

export const FAULT_NAMES = [
  "duplicate-node-id",
  "dangling-road-reference",
  "equal-road-endpoints",
  "non-positive-road-width",
  "unknown-road-kind",
  "non-boolean-one-way",
  "place-empty-name",
  "place-duplicate-id",
  "place-text-coordinate",
  "area-unknown-kind",
  "area-short-polygon",
  "prop-zero-width",
  "prop-text-rotation",
  "background-opacity-too-high",
  "background-scale-zero",
  "style-colour-not-text",
  "style-line-width-zero",
  "malformed-text",
  "non-object-top-level",
  "missing-top-level-field",
  "unsupported-version",
] as const;

export type FaultName = (typeof FAULT_NAMES)[number];

export interface InjectedFault {
  /** The broken map file text. */
  text: string;
  /** The field the loader must name in at least one error. */
  field: string;
  /** The item the loader must name in that error, when the loader names one. */
  item?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

/** The top-level fields a map file must carry. */
const REQUIRED_TOP_LEVEL = [
  "nodes",
  "roads",
  "places",
  "blockedAreas",
  "props",
  "style",
] as const;

function pick<T>(list: T[], choice: number): T {
  const entry = list[Math.abs(choice) % list.length];
  if (entry === undefined) throw new Error("fault injector: empty list");
  return entry;
}

function ensureRoad(file: Loose): void {
  if (file["nodes"].length < 2) {
    file["nodes"].push(
      { id: "extra-a", x: 0, y: 0 },
      { id: "extra-b", x: 10, y: 0 },
    );
  }
  if (file["roads"].length === 0) {
    file["roads"].push({
      id: "extra-road",
      fromNodeId: file["nodes"][0].id,
      toNodeId: file["nodes"][1].id,
      width: 4,
      kind: "side",
    });
  }
}

function ensurePlace(file: Loose): void {
  if (file["places"].length === 0) {
    file["places"].push({
      id: "extra-place",
      name: "Extra",
      category: "shop",
      x: 0,
      y: 0,
    });
  }
}

function ensureArea(file: Loose): void {
  if (file["blockedAreas"].length === 0) {
    file["blockedAreas"].push({
      id: "extra-area",
      kind: "water",
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
    });
  }
}

function ensureProp(file: Loose): void {
  if (file["props"].length === 0) {
    file["props"].push({
      id: "extra-prop",
      kind: "tree",
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      rotationDegrees: 0,
    });
  }
}

function ensureBackground(file: Loose): void {
  if (file["backgroundPicture"] === undefined) {
    file["backgroundPicture"] = { ref: "plan.png", scale: 1, opacity: 0.5 };
  }
}

function ensureStyleEntries(file: Loose): void {
  file["style"]["colors"]["extra-colour"] = "#000000";
  file["style"]["lineStyles"]["extra-line"] = { width: 2 };
}

/**
 * Break a valid map file with one named fault. `choice` picks which item of
 * its kind is damaged (taken modulo the number of items).
 */
export function injectFault(
  file: MapFile,
  fault: FaultName,
  choice = 0,
): InjectedFault {
  const data = structuredClone(file) as unknown as Loose;
  const done = (field: string, item?: string): InjectedFault => {
    const result: InjectedFault = { text: JSON.stringify(data), field };
    if (item !== undefined) result.item = item;
    return result;
  };

  switch (fault) {
    case "duplicate-node-id": {
      if (data["nodes"].length === 0) {
        data["nodes"].push({ id: "extra-a", x: 0, y: 0 });
      }
      const original = pick<Loose>(data["nodes"], choice);
      data["nodes"].push({ id: original["id"], x: 1, y: 1 });
      return done("nodes", original["id"]);
    }
    case "dangling-road-reference": {
      ensureRoad(data);
      const road = pick<Loose>(data["roads"], choice);
      road["fromNodeId"] = "no-such-node";
      return done("fromNodeId", road["id"]);
    }
    case "equal-road-endpoints": {
      ensureRoad(data);
      const road = pick<Loose>(data["roads"], choice);
      road["toNodeId"] = road["fromNodeId"];
      return done("toNodeId", road["id"]);
    }
    case "non-positive-road-width": {
      ensureRoad(data);
      const road = pick<Loose>(data["roads"], choice);
      road["width"] = choice % 2 === 0 ? 0 : -3;
      return done("width", road["id"]);
    }
    case "unknown-road-kind": {
      ensureRoad(data);
      const road = pick<Loose>(data["roads"], choice);
      road["kind"] = "motorway";
      return done("kind", road["id"]);
    }
    case "non-boolean-one-way": {
      ensureRoad(data);
      const road = pick<Loose>(data["roads"], choice);
      road["oneWay"] = choice % 2 === 0 ? "yes" : 1;
      return done("oneWay", road["id"]);
    }
    case "place-empty-name": {
      ensurePlace(data);
      const place = pick<Loose>(data["places"], choice);
      place["name"] = "";
      return done("name", place["id"]);
    }
    case "place-duplicate-id": {
      ensurePlace(data);
      const place = pick<Loose>(data["places"], choice);
      data["places"].push({ ...place });
      return done("places", place["id"]);
    }
    case "place-text-coordinate": {
      ensurePlace(data);
      const place = pick<Loose>(data["places"], choice);
      place["x"] = "left";
      return done("x", place["id"]);
    }
    case "area-unknown-kind": {
      ensureArea(data);
      const area = pick<Loose>(data["blockedAreas"], choice);
      area["kind"] = "lava";
      return done("kind", area["id"]);
    }
    case "area-short-polygon": {
      ensureArea(data);
      const area = pick<Loose>(data["blockedAreas"], choice);
      area["polygon"] = area["polygon"].slice(0, 2);
      return done("polygon", area["id"]);
    }
    case "prop-zero-width": {
      ensureProp(data);
      const prop = pick<Loose>(data["props"], choice);
      prop["width"] = 0;
      return done("width", prop["id"]);
    }
    case "prop-text-rotation": {
      ensureProp(data);
      const prop = pick<Loose>(data["props"], choice);
      prop["rotationDegrees"] = "sideways";
      return done("rotationDegrees", prop["id"]);
    }
    case "background-opacity-too-high": {
      ensureBackground(data);
      data["backgroundPicture"]["opacity"] = 1.5;
      return done("opacity", "background picture");
    }
    case "background-scale-zero": {
      ensureBackground(data);
      data["backgroundPicture"]["scale"] = 0;
      return done("scale", "background picture");
    }
    case "style-colour-not-text": {
      ensureStyleEntries(data);
      data["style"]["colors"]["extra-colour"] = 12345;
      return done("colors", "extra-colour");
    }
    case "style-line-width-zero": {
      ensureStyleEntries(data);
      data["style"]["lineStyles"]["extra-line"] = { width: 0 };
      return done("width", "extra-line");
    }
    case "malformed-text": {
      const text = JSON.stringify(data);
      return { text: text.slice(0, text.length - 1), field: "map" };
    }
    case "non-object-top-level": {
      const texts = ["[]", "42", "null", '"text"', "true"];
      return { text: pick(texts, choice), field: "map" };
    }
    case "missing-top-level-field": {
      const field = pick([...REQUIRED_TOP_LEVEL], choice);
      delete data[field];
      return done(field);
    }
    case "unsupported-version": {
      data["formatVersion"] = choice % 2 === 0 ? 2 : 99;
      return done("formatVersion");
    }
  }
}
