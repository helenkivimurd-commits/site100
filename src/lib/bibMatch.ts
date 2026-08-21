// Matching a runner's bib number against the numbers written on the photos.
//
// The straightforward case is an exact match. The awkward case is that a bib
// is often only partly readable when it is tagged: an arm, a race belt or
// another runner covers part of the number, so what gets typed in /admin is
// only the digits that were actually visible. A photo of runner 2037 can end
// up tagged "37", "203", "20" or even "207" — the digits that could be seen,
// in the order they appear, with the hidden ones missing.
//
// A buyer, of course, types their whole number. So the tag is a SUBSEQUENCE of
// what they type, and plain equality (or "tag contains query") never finds it.
// That is the gap this closes: given 2037, a photo tagged "207" is a candidate,
// because 2-0-7 appears in 2-0-3-7 in that order with one digit hidden.
//
// These are suggestions, not answers. The caller is expected to show them
// separately from confident matches so nobody buys a photo of someone else.

/** Bibs get written various ways ("A-123", "123 ", "#123"). Compare the guts. */
export function normaliseBib(bib: string): string {
  return bib.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * True when every character of `fragment` appears in `full`, in order, though
 * not necessarily next to each other — i.e. `fragment` is what is left of
 * `full` once some characters are hidden.
 *
 *   isSubsequence("207", "2037") === true    // the 3 was covered
 *   isSubsequence("237", "2037") === true    // the 0 was covered
 *   isSubsequence("270", "2037") === false   // wrong order, not a hidden digit
 */
export function isSubsequence(fragment: string, full: string): boolean {
  if (fragment.length > full.length) return false;
  let f = 0;
  for (let i = 0; i < full.length && f < fragment.length; i++) {
    if (full[i] === fragment[f]) f++;
  }
  return f === fragment.length;
}

// How much of the number has to have been visible for a partial tag to be worth
// suggesting. Half, rounded up, and never fewer than two digits: a single digit
// would match a large share of the catalogue and help nobody.
export function minimumVisible(queryLength: number): number {
  return Math.max(2, Math.ceil(queryLength / 2));
}

export type BibMatch =
  /** The tag and the query are the same number. */
  | { kind: "exact"; tag: string }
  /**
   * The tag contains the query — the buyer typed only part of their number,
   * which is what the gallery's filter box has always done.
   */
  | { kind: "contains"; tag: string }
  /**
   * The tag is a partly-hidden version of the query. `visible` is how many
   * digits were readable and `contiguous` is whether they ran together
   * ("37" out of "2037") rather than being split around a covered digit
   * ("207"), which is the more convincing of the two.
   */
  | { kind: "partial"; tag: string; visible: number; contiguous: boolean };

/**
 * Best match between one photo's tags and what the buyer typed, or null.
 * Exact beats contains beats partial; among partials, more visible digits win,
 * and a contiguous run beats one broken by a covered digit.
 */
export function matchBibs(query: string, tags: string[]): BibMatch | null {
  const q = normaliseBib(query);
  if (!q) return null;

  let best: BibMatch | null = null;
  const rank = (m: BibMatch) => (m.kind === "exact" ? 3 : m.kind === "contains" ? 2 : 1);

  for (const raw of tags) {
    const tag = normaliseBib(raw);
    if (!tag) continue;

    let candidate: BibMatch | null = null;

    if (tag === q) {
      candidate = { kind: "exact", tag };
    } else if (tag.includes(q)) {
      candidate = { kind: "contains", tag };
    } else if (
      tag.length < q.length &&
      tag.length >= minimumVisible(q.length) &&
      isSubsequence(tag, q)
    ) {
      candidate = { kind: "partial", tag, visible: tag.length, contiguous: q.includes(tag) };
    }

    if (!candidate) continue;
    if (!best) {
      best = candidate;
      continue;
    }
    if (rank(candidate) > rank(best)) {
      best = candidate;
    } else if (rank(candidate) === rank(best) && candidate.kind === "partial" && best.kind === "partial") {
      if (
        candidate.visible > best.visible ||
        (candidate.visible === best.visible && candidate.contiguous && !best.contiguous)
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

/** Sorts the "might be you" suggestions so the most convincing come first. */
export function comparePartials(
  a: { visible: number; contiguous: boolean },
  b: { visible: number; contiguous: boolean }
): number {
  if (a.visible !== b.visible) return b.visible - a.visible;
  if (a.contiguous !== b.contiguous) return a.contiguous ? -1 : 1;
  return 0;
}
