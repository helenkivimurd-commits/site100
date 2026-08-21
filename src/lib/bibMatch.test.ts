import test from "node:test";
import assert from "node:assert/strict";
import { matchBibs, isSubsequence, minimumVisible, normaliseBib } from "./bibMatch.ts";

//   npm test
//
// Node runs TypeScript directly, so this needs no build step and no test
// framework. The cases below are the real ones: a bib is photographed with an
// arm across it, only part of the number gets tagged, and the runner still has
// to be able to find themselves.

const kindOf = (query: string, tags: string[]) => matchBibs(query, tags)?.kind ?? null;

test("an exact number is an exact match", () => {
  assert.equal(kindOf("2037", ["2037"]), "exact");
  assert.equal(kindOf("216", ["216"]), "exact");
});

test("a buyer typing only part of their number still filters", () => {
  // The gallery's filter box has always worked this way; keep it working.
  assert.equal(kindOf("37", ["2037"]), "contains");
});

test("a partly hidden tag is found for the full number", () => {
  // Runner 2037, photographed with something across the bib.
  assert.equal(kindOf("2037", ["37"]), "partial"); // first two digits covered
  assert.equal(kindOf("2037", ["20"]), "partial"); // last two covered
  assert.equal(kindOf("2037", ["203"]), "partial"); // last digit covered
  assert.equal(kindOf("2037", ["037"]), "partial"); // first digit covered
  assert.equal(kindOf("2037", ["207"]), "partial"); // a middle digit covered
});

test("a digit hidden in the middle is reported as not contiguous", () => {
  const split = matchBibs("2037", ["207"]);
  const together = matchBibs("2037", ["037"]);
  assert.equal(split?.kind === "partial" && split.contiguous, false);
  assert.equal(together?.kind === "partial" && together.contiguous, true);
});

test("too little of the number to be worth suggesting", () => {
  // One digit would match a large share of the catalogue.
  assert.equal(kindOf("2037", ["2"]), null);
  // Half the digits, rounded up, and never fewer than two.
  assert.equal(minimumVisible(4), 2);
  assert.equal(minimumVisible(5), 3);
  assert.equal(minimumVisible(2), 2);
  // A two-digit bib therefore has no partial matches at all.
  assert.equal(kindOf("37", ["3"]), null);
});

test("digits in the wrong order are a different runner, not a hidden digit", () => {
  assert.equal(kindOf("2037", ["270"]), null);
  assert.equal(kindOf("2037", ["73"]), null);
});

test("unrelated numbers do not match", () => {
  assert.equal(kindOf("2037", ["1153"]), null);
  assert.equal(kindOf("2037", ["28"]), null);
  assert.equal(kindOf("2037", []), null);
  assert.equal(kindOf("", ["2037"]), null);
});

test("a confident match wins over a hopeful one", () => {
  assert.equal(kindOf("2037", ["20", "2037"]), "exact");
  assert.equal(kindOf("2037", ["20", "203"]), "partial");
  const best = matchBibs("2037", ["20", "203"]);
  // More visible digits is the more convincing suggestion.
  assert.equal(best?.kind === "partial" && best.tag, "203");
});

test("bibs written with punctuation still compare", () => {
  assert.equal(normaliseBib("#216"), "216");
  assert.equal(normaliseBib("a-216 "), "A216");
  assert.equal(kindOf("216", ["#216"]), "exact");
});

test("isSubsequence", () => {
  assert.equal(isSubsequence("207", "2037"), true);
  assert.equal(isSubsequence("237", "2037"), true);
  assert.equal(isSubsequence("270", "2037"), false);
  assert.equal(isSubsequence("2037", "207"), false);
  assert.equal(isSubsequence("", "2037"), true);
});
