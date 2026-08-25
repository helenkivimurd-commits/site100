import Link from "next/link";
import { localDay, readEvents } from "@/lib/analytics";
import { readJsonFile } from "@/lib/storage";
import { ORDERS_FILE } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visitors — h_kivimurd Photography" };

type Order = { amountTotal?: number; photoIds?: string[]; status?: string; createdAt?: string };

const DAYS = 30;

// Days are counted in Estonian time, not UTC. Someone searching at eleven at
// night is looking today, and would otherwise be filed under yesterday —
// which matters exactly when it is being looked at: the evening after a race,
// or the hours after something is posted on Instagram.
const day = (t: number) => localDay(new Date(t));
const pretty = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });

// All the counting happens here rather than inside the component: it reads the
// clock, and a render must not. One reading is used throughout, so the chart
// and the totals above it always describe the same moment.
async function gather() {
  // Read once: every window below must describe the same moment, and calling
  // the clock repeatedly during a render is both impure and a way to get a
  // chart that disagrees with the totals above it.
  const now = Date.now();
  const events = await readEvents(DAYS);
  const orders = await readJsonFile<Record<string, Order>>(ORDERS_FILE, {});

  const views = events.filter((e) => e.k === "view");
  const searches = events.filter((e) => e.k === "search");
  const failed = searches.filter((e) => (e.n ?? 0) === 0);

  // A visitor is counted once a day, because that is as long as the thing
  // standing in for them lasts.
  const peopleOn = new Map<string, Set<string>>();
  const viewsOn = new Map<string, number>();
  for (const e of views) {
    const d = day(e.t);
    if (!peopleOn.has(d)) peopleOn.set(d, new Set());
    if (e.v) peopleOn.get(d)!.add(e.v);
    viewsOn.set(d, (viewsOn.get(d) ?? 0) + 1);
  }

  // Stepped back from midday so that the hour the clocks change cannot produce
  // a repeated or missing day in the chart.
  const noonToday = Date.parse(`${day(now)}T12:00:00Z`);
  const days: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    days.push(new Date(noonToday - i * 86_400_000).toISOString().slice(0, 10));
  }
  const busiest = Math.max(1, ...days.map((d) => peopleOn.get(d)?.size ?? 0));

  const people = new Set(views.map((e) => e.v).filter(Boolean)).size;
  const searchers = new Set(searches.map((e) => e.v).filter(Boolean)).size;

  const paidInWindow = Object.values(orders).filter(
    (o) => o.status === "paid" && o.createdAt && Date.parse(o.createdAt) > now - DAYS * 86_400_000
  );
  const earned = paidInWindow.reduce((n, o) => n + (o.amountTotal ?? 0), 0);
  const sold = paidInWindow.reduce((n, o) => n + (o.photoIds?.length ?? 0), 0);

  const tally = (rows: string[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r, (m.get(r) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const fromWhere = tally(views.map((e) => e.r ?? "direct"));
  const pages = tally(views.map((e) => e.p ?? "/"));
  const missed = tally(failed.map((e) => e.q ?? "?"));
  const found = tally(searches.filter((e) => (e.n ?? 0) > 0).map((e) => e.q ?? "?"));

  return {
    events, people, views, searches, failed, searchers,
    peopleOn, viewsOn, days, busiest,
    earned, sold, paidInWindow, fromWhere, pages, missed, found,
  };
}

export default async function StatsPage() {
  const {
    events, people, views, searches, failed, searchers,
    peopleOn, viewsOn, days, busiest,
    earned, sold, paidInWindow, fromWhere, pages, missed, found,
  } = await gather();

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Internal tool</p>
      <h1 className="mt-1 font-display text-4xl uppercase tracking-wide">Visitors</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        The last {DAYS} days. Counted on your own server — no cookies, nothing shared with anyone,
        and nothing stored that could identify a person.
      </p>
      <Link href="/admin" className="mt-3 inline-block font-mono text-xs uppercase tracking-wide text-blue">
        ← Manage photos
      </Link>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="People" value={people} note={`${views.length} pages opened`} />
        <Figure label="Searched a bib" value={searchers} note={`${searches.length} searches`} />
        <Figure label="Found nothing" value={failed.length} note={`of ${searches.length} searches`} warn={failed.length > 0} />
        <Figure label="Sold" value={`€${(earned / 100).toFixed(2)}`} note={`${sold} photo${sold === 1 ? "" : "s"}, ${paidInWindow.length} order${paidInWindow.length === 1 ? "" : "s"}`} />
      </div>

      {events.length === 0 && (
        <p className="mt-8 rounded-md border border-card p-4 text-sm text-muted">
          Nothing recorded yet. Counting starts from the moment this went live — open the site in
          another browser and this page will show it.
        </p>
      )}

      <Section title="Searches that found nothing"
        note="Each one is someone who left without buying. If a number here is a runner you photographed, the photo is tagged wrong.">
        {missed.length === 0 ? (
          <p className="text-sm text-muted">None — every search so far found photos.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {missed.map(([bib, n]) => (
              <li key={bib} className="rounded-full border border-magenta/40 bg-magenta/5 px-3 py-1 font-mono text-sm">
                {bib}
                {n > 1 && <span className="ml-1.5 text-xs text-muted">×{n}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="People each day">
        <div className="flex items-end gap-[3px]" style={{ height: 120 }}>
          {days.map((d) => {
            const n = peopleOn.get(d)?.size ?? 0;
            return (
              <div key={d} className="group relative flex-1" title={`${pretty(d)} — ${n} people, ${viewsOn.get(d) ?? 0} pages`}>
                <div
                  className={`w-full rounded-sm ${n ? "bg-blue" : "bg-card"}`}
                  style={{ height: Math.max(2, (n / busiest) * 120) }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase text-muted">
          <span>{pretty(days[0])}</span>
          <span>busiest day: {busiest}</span>
          <span>{pretty(days[days.length - 1])}</span>
        </div>
      </Section>

      <div className="grid gap-8 sm:grid-cols-2">
        <Section title="Where they came from">
          <Bars rows={fromWhere} total={views.length} />
        </Section>
        <Section title="Most opened pages">
          <Bars rows={pages.slice(0, 8)} total={views.length} />
        </Section>
      </div>

      <Section title="Numbers people searched for"
        note="Searches that found photos. A number searched many times is someone coming back.">
        {found.length === 0 ? (
          <p className="text-sm text-muted">No successful searches yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {found.slice(0, 60).map(([bib, n]) => (
              <li key={bib} className="rounded-full border border-card px-3 py-1 font-mono text-sm">
                {bib}
                {n > 1 && <span className="ml-1.5 text-xs text-muted">×{n}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Figure({ label, value, note, warn }: { label: string; value: number | string; note?: string; warn?: boolean }) {
  return (
    <div className={`rounded-md border p-4 ${warn ? "border-magenta/40" : "border-card"}`}>
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 font-display text-3xl ${warn ? "text-magenta" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 font-mono text-[10px] text-muted">{note}</p>}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl uppercase tracking-wide">{title}</h2>
      {note && <p className="mb-3 mt-1 max-w-2xl text-sm text-muted">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Bars({ rows, total }: { rows: [string, number][]; total: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Nothing yet.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map(([name, n]) => (
        <li key={name} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate font-mono text-xs">{name}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-card">
            <span className="block h-full rounded-full bg-blue" style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
          </span>
          <span className="w-10 shrink-0 text-right font-mono text-xs text-muted">{n}</span>
        </li>
      ))}
    </ul>
  );
}
