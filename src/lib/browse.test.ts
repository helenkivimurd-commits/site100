import test from "node:test";
import assert from "node:assert/strict";
import { browse, splitByBib, NO_BIB_ALBUM } from "./browse.ts";
import type { Photo } from "./types.ts";

const photo = (id: string, event: string, discipline: string, bibs: string[] = []): Photo =>
  ({
    id,
    title: id,
    event,
    day: "Thursday, August 20",
    discipline: discipline as Photo["discipline"],
    width: 1600, height: 1066, thumbWidth: 900, thumbHeight: 600,
    bibs,
    reviewed: true,
    price: 5,
  }) as Photo;

const all = [
  photo("a", "Sunset run", "Run", ["216"]),
  photo("b", "Sunset run", "Run", ["1299"]),
  photo("c", "Sunset run", "Crowd"),
  photo("d", "Ironman 70.3", "Swim", ["216"]),
  photo("e", "Ironman 70.3", "Bike", ["300"]),
  photo("f", "Ironman 70.3", "Bike", ["301"]),
];

test("with nothing chosen, the events are the folders", () => {
  const view = browse(all, {});
  assert.equal(view.kind, "events");
  if (view.kind !== "events") return;
  // Biggest folder first, so the main shoot leads.
  assert.deepEqual(view.folders.map((f) => [f.name, f.count]), [
    ["Ironman 70.3", 3],
    ["Sunset run", 3],
  ]);
  assert.ok(view.folders[0].cover, "a folder carries a photo to show on its tile");
});

test("choosing an event shows the disciplines inside it, and only those", () => {
  const view = browse(all, { event: "Ironman 70.3" });
  assert.equal(view.kind, "disciplines");
  if (view.kind !== "disciplines") return;
  assert.deepEqual(view.folders.map((f) => [f.name, f.count]), [["Bike", 2], ["Swim", 1]]);
});

test("choosing both shows just that folder's photos", () => {
  const view = browse(all, { event: "Ironman 70.3", discipline: "Bike" });
  assert.equal(view.kind, "photos");
  if (view.kind !== "photos") return;
  assert.deepEqual(view.photos.map((p) => p.id), ["e", "f"]);
});

test("a bib typed before choosing an event searches everything", () => {
  // Bib 216 appears at both events; a runner who did two races sees both.
  const view = browse(all, { bib: "216" });
  assert.equal(view.kind, "search");
  if (view.kind !== "search") return;
  assert.deepEqual(view.photos.map((p) => p.id), ["a", "d"]);
});

test("a bib typed inside a folder searches only that folder", () => {
  const view = browse(all, { event: "Sunset run", discipline: "Run", bib: "216" });
  assert.equal(view.kind, "photos");
  if (view.kind !== "photos") return;
  // The view carries the folder; the client narrows within it as she types.
  assert.deepEqual(view.photos.map((p) => p.id), ["a", "b"]);
  const { photos } = splitByBib(view.photos, "216");
  assert.deepEqual(photos.map((p) => p.id), ["a"]);
});

test("partly readable bibs are kept apart from confident ones", () => {
  // "1299" tagged on b; a runner typing 1299 matches it exactly. A runner
  // typing 12990 would not — but 1299 is a subsequence, so it is a suggestion.
  const { photos, maybes } = splitByBib(all, "1299");
  assert.deepEqual(photos.map((p) => p.id), ["b"]);
  assert.deepEqual(maybes, []);
});

test("an event or discipline that no photo uses is not a crash", () => {
  assert.equal(browse(all, { event: "Nonexistent" }).kind, "empty");
  assert.equal(browse(all, { event: "Sunset run", discipline: "Swim" }).kind, "empty");
});

test("photos with no event are left out of the folder list", () => {
  const view = browse([...all, photo("g", "", "Run")], {});
  assert.equal(view.kind, "events");
  if (view.kind !== "events") return;
  assert.deepEqual(view.folders.map((f) => f.name), ["Ironman 70.3", "Sunset run"]);
});

test("a bib typed from inside an event searches only that event", () => {
  // Bib 216 exists at both events. From inside Ironman, only its own photo.
  const view = browse(all, { event: "Ironman 70.3", bib: "216" });
  assert.equal(view.kind, "search");
  if (view.kind !== "search") return;
  assert.equal(view.event, "Ironman 70.3");
  assert.deepEqual(view.photos.map((p) => p.id), ["d"]);
});

test("the same bib from the top still finds both events", () => {
  const view = browse(all, { bib: "216" });
  assert.equal(view.kind, "search");
  if (view.kind !== "search") return;
  assert.equal(view.event, undefined);
  assert.deepEqual(view.photos.map((p) => p.id), ["a", "d"]);
});

test("the no-bib album gathers only photos looked at and found unreadable", () => {
  const catalogue = [
    ...all,
    { ...photo("h", "Sunset run", "Run"), reviewed: true },   // looked at, no bib
    { ...photo("i", "Sunset run", "Run"), reviewed: false },  // not looked at yet
  ];
  const view = browse(catalogue, { event: "Sunset run", noBib: true });
  assert.equal(view.kind, "nobib");
  if (view.kind !== "nobib") return;
  // "c" is the Crowd photo with no bibs; "h" was marked No bib. "i" is simply
  // untagged so far and must not be presented as unreadable.
  assert.deepEqual(view.photos.map((p) => p.id), ["c", "h"]);
});

test("the album appears alongside the disciplines, listed last", () => {
  const view = browse(all, { event: "Sunset run" });
  assert.equal(view.kind, "disciplines");
  if (view.kind !== "disciplines") return;
  assert.equal(view.folders.at(-1)?.name, NO_BIB_ALBUM);
  assert.equal(view.folders.at(-1)?.noBib, true);
  // The run photos are still in Run — the album cuts across, it does not move.
  assert.equal(view.folders.find((f) => f.name === "Run")?.count, 2);
});

test("no album tile when every photo in the event has a bib", () => {
  const view = browse(all, { event: "Ironman 70.3" });
  assert.equal(view.kind, "disciplines");
  if (view.kind !== "disciplines") return;
  assert.ok(!view.folders.some((f) => f.noBib));
});

test("the album can be opened across every event at once", () => {
  const view = browse(all, { noBib: true });
  assert.equal(view.kind, "nobib");
  if (view.kind !== "nobib") return;
  assert.equal(view.event, undefined);
  assert.deepEqual(view.photos.map((p) => p.id), ["c"]);
});

test("an empty search offers each event's unreadable photos separately", () => {
  const catalogue = [
    ...all,
    { ...photo("h", "Sunset run", "Run"), reviewed: true },
    { ...photo("i", "Ironman 70.3", "Swim"), reviewed: true },
    { ...photo("j", "Ironman 70.3", "Bike"), reviewed: true },
  ];
  const view = browse(catalogue, { bib: "99999" });
  assert.equal(view.kind, "search");
  if (view.kind !== "search") return;
  assert.deepEqual(view.photos, []);
  // Two races, each counted on its own, biggest first — never one merged pile.
  assert.deepEqual(view.noBibByEvent, [
    { event: "Ironman 70.3", count: 2 },
    { event: "Sunset run", count: 2 },
  ]);
});

test("a search inside one event only offers that event", () => {
  const catalogue = [...all, { ...photo("i", "Ironman 70.3", "Swim"), reviewed: true }];
  const view = browse(catalogue, { event: "Ironman 70.3", bib: "99999" });
  assert.equal(view.kind, "search");
  if (view.kind !== "search") return;
  assert.deepEqual(view.noBibByEvent, [{ event: "Ironman 70.3", count: 1 }]);
});

test("the album can be narrowed to one discipline", () => {
  const catalogue = [
    ...all,
    { ...photo("i", "Ironman 70.3", "Swim"), reviewed: true },
    { ...photo("j", "Ironman 70.3", "Bike"), reviewed: true },
  ];
  const whole = browse(catalogue, { event: "Ironman 70.3", noBib: true });
  assert.equal(whole.kind, "nobib");
  if (whole.kind !== "nobib") return;
  assert.deepEqual(whole.photos.map((p) => p.id), ["i", "j"]);
  assert.deepEqual(whole.disciplines, [{ name: "Bike", count: 1 }, { name: "Swim", count: 1 }]);

  const justSwim = browse(catalogue, { event: "Ironman 70.3", noBib: true, discipline: "Swim" });
  assert.equal(justSwim.kind, "nobib");
  if (justSwim.kind !== "nobib") return;
  assert.deepEqual(justSwim.photos.map((p) => p.id), ["i"]);
  // The chips still list everything, so All and Bike remain reachable.
  assert.equal(justSwim.disciplines.length, 2);
});
