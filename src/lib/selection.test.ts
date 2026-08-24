import test from "node:test";
import assert from "node:assert/strict";
import { selectionAfterClick } from "./selection.ts";

const rows = ["a", "b", "c", "d", "e"];

const click = (
  clickedId: string,
  {
    anchorId = null,
    selected = new Set<string>(),
    shift = false,
  }: { anchorId?: string | null; selected?: Set<string>; shift?: boolean } = {}
) => selectionAfterClick({ visibleIds: rows, clickedId, anchorId, selected, extendRange: shift });

test("a plain click selects, and becomes the anchor", () => {
  const r = click("b");
  assert.deepEqual([...r.selected], ["b"]);
  assert.equal(r.anchorId, "b");
});

test("clicking a selected row again unselects it", () => {
  const r = click("b", { selected: new Set(["b"]), anchorId: "b" });
  assert.deepEqual([...r.selected], []);
});

test("shift-click takes everything between the two rows", () => {
  const r = click("d", { anchorId: "b", selected: new Set(["b"]), shift: true });
  assert.deepEqual([...r.selected].sort(), ["b", "c", "d"]);
});

test("the range works upwards too", () => {
  const r = click("a", { anchorId: "d", selected: new Set(["d"]), shift: true });
  assert.deepEqual([...r.selected].sort(), ["a", "b", "c", "d"]);
});

test("the anchor stays put, so a range can be redrawn longer", () => {
  const first = click("c", { anchorId: "a", selected: new Set(["a"]), shift: true });
  assert.deepEqual([...first.selected].sort(), ["a", "b", "c"]);
  assert.equal(first.anchorId, "a");
  const second = selectionAfterClick({
    visibleIds: rows, clickedId: "e", anchorId: first.anchorId,
    selected: first.selected, extendRange: true,
  });
  assert.deepEqual([...second.selected].sort(), ["a", "b", "c", "d", "e"]);
});

test("shift only ever adds — a range never switches rows back off", () => {
  // c is already ticked. Selecting b..d must not toggle it away, or a long
  // range could never be built up over an existing selection.
  const r = click("d", { anchorId: "b", selected: new Set(["c"]), shift: true });
  assert.deepEqual([...r.selected].sort(), ["b", "c", "d"]);
});

test("shift with nothing to reach from behaves as an ordinary click", () => {
  const r = click("c", { anchorId: null, shift: true });
  assert.deepEqual([...r.selected], ["c"]);
  assert.equal(r.anchorId, "c");
});

test("an anchor that has been filtered off screen does not break the click", () => {
  const r = selectionAfterClick({
    visibleIds: rows, clickedId: "c", anchorId: "zz",
    selected: new Set(), extendRange: true,
  });
  assert.deepEqual([...r.selected], ["c"]);
});

test("the range follows what is on screen, not the whole library", () => {
  // With a filter on, only these three rows are showing; a range from a to e
  // must take the visible ones between them and nothing else.
  const r = selectionAfterClick({
    visibleIds: ["a", "c", "e"], clickedId: "e", anchorId: "a",
    selected: new Set(["a"]), extendRange: true,
  });
  assert.deepEqual([...r.selected].sort(), ["a", "c", "e"]);
});

test("shift-clicking the anchor itself just toggles it", () => {
  const r = click("b", { anchorId: "b", selected: new Set(["b"]), shift: true });
  assert.deepEqual([...r.selected], []);
});
