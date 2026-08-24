/**
 * Which photos a click should leave selected.
 *
 * Tagging a race means picking out long runs of consecutive photos — the same
 * runner appears in twenty frames in a row — so ticking each box on its own is
 * the slowest part of the job. Clicking one row and shift-clicking another
 * takes everything between them, the way a file list does.
 *
 * `visibleIds` is the rows in the order they are on screen, which is what was
 * actually clicked: with a filter on, the range must follow what is showing
 * rather than the underlying library.
 */
export function selectionAfterClick({
  visibleIds,
  clickedId,
  anchorId,
  selected,
  extendRange,
}: {
  visibleIds: string[];
  clickedId: string;
  anchorId: string | null;
  selected: ReadonlySet<string>;
  extendRange: boolean;
}): { selected: Set<string>; anchorId: string | null } {
  const from = anchorId === null ? -1 : visibleIds.indexOf(anchorId);
  const to = visibleIds.indexOf(clickedId);

  // A shift-click with somewhere to reach from takes the whole span. Without an
  // anchor — the first click of all, or one whose row has since been filtered
  // away — it behaves as an ordinary click rather than doing nothing.
  if (extendRange && from !== -1 && to !== -1 && from !== to) {
    const [start, end] = from < to ? [from, to] : [to, from];
    // Shift always adds. Having part of a range switch off again because it was
    // already ticked would make a long selection impossible to build up.
    const next = new Set(selected);
    for (const id of visibleIds.slice(start, end + 1)) next.add(id);
    // The anchor stays put, so a second shift-click can redraw a longer range
    // from the same starting row.
    return { selected: next, anchorId };
  }

  const next = new Set(selected);
  if (next.has(clickedId)) next.delete(clickedId);
  else next.add(clickedId);
  return { selected: next, anchorId: clickedId };
}
