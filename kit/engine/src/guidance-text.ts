import type { Guidance, NoWayResult } from "./types";

/**
 * Plain words for the guidance data. A pure function of its arguments.
 * `placeName` is the name of the destination when it is a place; it is
 * added to the arrival sentence. A straight-on turn has no sentence
 * because it is never reported as a next turn.
 */
export function toSentence(
  guidance: Guidance,
  noWayResult?: NoWayResult,
  placeName?: string,
): string {
  if (!guidance.active) {
    if (noWayResult !== undefined) {
      return `There is no route. ${noWayResult.message}`;
    }
    return "There is no route.";
  }
  if (guidance.arrived === true) {
    return placeName === undefined
      ? "You have arrived."
      : `You have arrived: ${placeName}.`;
  }
  if (guidance.nextTurn !== undefined) {
    const distance = Math.round(guidance.distanceToTurnWorldUnits ?? 0);
    const words = guidance.nextTurn === "turn-back" ? "turn back" : `turn ${guidance.nextTurn}`;
    return `${words} in ${distance}`;
  }
  if (guidance.distanceLeftWorldUnits !== undefined) {
    return `go straight on for ${Math.round(guidance.distanceLeftWorldUnits)}`;
  }
  return "There is no route.";
}
