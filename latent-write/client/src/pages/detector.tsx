import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ScanSearch, AlertTriangle, Info } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { Gauge, verdictOf, VERDICT_LABEL, VERDICT_TEXT, verdictColor } from "@/components/score";
import { useModel } from "@/lib/model";
import { analyze } from "@shared/analysis";
import { words } from "@shared/core";
import samples from "@/data/samples.json";
import report from "@/data/report.json";

const MIN_WORDS = 30, WARN_WORDS = 80;

export default function Detector() {
  const m = useModel();
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<string | null>(null);
  const n = useMemo(() => words(text).length, [text]);
  const result = useMemo(() => (m && checked ? analyze(m, checked) : null), [m, checked]);
  const run = () => setChecked(text);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader title="AI Detector" desc="Paste any writing to estimate how likely it is to be AI-generated. You'll see which sentences and patterns drove the score." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text here. 80 words or more gives the most reliable result."
            className="min-h-[360px] resize-y font-serif text-[15px] leading-relaxed" data-testid="input-detector" aria-label="Text to check" />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={run} disabled={!m || n < MIN_WORDS} data-testid="button-check">
              {!m ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
              {!m ? "Loading model" : "Check text"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setText(samples.ai.text); setChecked(null); }} data-testid="button-sample-ai">AI sample</Button>
            <Button variant="outline" size="sm" onClick={() => { setText(samples.human.text); setChecked(null); }} data-testid="button-sample-human">Human sample</Button>
            {text && <Button variant="ghost" size="sm" onClick={() => { setText(""); setChecked(null); }} data-testid="button-clear">Clear</Button>}
            <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums" data-testid="text-wordcount">{n} words</span>
          </div>
          {n > 0 && n < MIN_WORDS && <p className="text-xs text-muted-foreground" data-testid="text-too-short">Add at least {MIN_WORDS} words. Shorter text doesn't carry enough signal to judge.</p>}
          {n >= MIN_WORDS && n < WARN_WORDS && <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-[hsl(var(--chart-4))]" data-testid="text-short-warning"><AlertTriangle className="h-3.5 w-3.5" />Short text. Results under 80 words are noticeably less reliable.</p>}
        </section>

        <section aria-live="polite">
          {!result ? (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center" data-testid="empty-detector">
              <ScanSearch className="h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No result yet</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">Paste text or load a sample, then select Check text.</p>
            </div>
          ) : (
            <>
              {checked !== text && <p className="mb-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground" data-testid="text-stale">The text has changed since this check. Select Check text to update.</p>}
              <div className={checked !== text ? "opacity-60 transition-opacity" : "transition-opacity"}><Results m={m!} r={result} /></div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Results({ m, r }: { m: NonNullable<ReturnType<typeof useModel>>; r: ReturnType<typeof analyze> }) {
  const thr = r.threshold, low = Math.min(m.calibration.bands.low, thr);
  const v = verdictOf(m, r.p, thr);
  const flagged = r.sentences.filter((s) => s.p >= thr).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-card p-5" data-testid="card-result">
        <div className="flex items-baseline gap-3">
          <span className={`text-xl font-semibold ${verdictColor[v]}`} data-testid="text-verdict">{VERDICT_LABEL[v]}</span>
          <span className="ml-auto font-mono text-xl font-semibold tabular-nums" data-testid="text-score">{Math.round(r.p * 100)}<span className="text-sm text-muted-foreground font-normal"> / 100</span></span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{VERDICT_TEXT[v]}</p>
        <div className="mt-5"><Gauge m={m} p={r.p} thr={thr} /></div>
        {r.stats.words < WARN_WORDS && <p className="mt-4 text-xs text-amber-700 dark:text-[hsl(var(--chart-4))]">Based on only {r.stats.words} words, so treat this as a rough guess.</p>}
        <p className="mt-4 flex gap-1.5 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5 shrink-0 mt-px" />On held-out tests this detector wrongly flagged {Math.round(report.overall.human_false_flag * 1000) / 10}% of human texts. A score is evidence, not proof. <Link href="/accuracy" className="underline underline-offset-2 hover:text-foreground" data-testid="link-accuracy">See accuracy</Link></p>
      </div>

      <div className="rounded-lg border bg-card p-5" data-testid="card-sentences">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Sentence view</h2>
          <span className="text-xs text-muted-foreground">{flagged} of {r.sentences.length} sentences read as AI</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(var(--chart-5)/.35)]" />Reads as AI</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(var(--chart-4)/.25)]" />Unclear</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border" />Reads as human</span>
        </div>
        <div className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap font-serif text-[15px] leading-[1.8]" data-testid="text-highlighted">
          {renderHighlights(r.text, r.sentences, thr, low)}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Each sentence is scored together with its neighbors, since single sentences are too short to judge alone.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-5" data-testid="card-signals-ai">
          <h2 className="text-sm font-semibold">Patterns pointing to AI</h2>
          <SignalList items={r.grams.ai} empty="No strong AI patterns found." tone="ai" />
          {r.phrases.length > 0 && (
            <>
              <h3 className="mt-4 text-xs font-medium text-muted-foreground">Words often overused by chatbots</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">{r.phrases.slice(0, 10).map((p) => <Badge key={p.phrase} variant="secondary" className="font-normal">{p.phrase}{p.count > 1 ? ` ×${p.count}` : ""}</Badge>)}</div>
            </>
          )}
        </div>
        <div className="rounded-lg border bg-card p-5" data-testid="card-signals-human">
          <h2 className="text-sm font-semibold">Patterns pointing to a person</h2>
          <SignalList items={r.grams.human} empty="No strong human patterns found." tone="human" />
          <h3 className="mt-4 text-xs font-medium text-muted-foreground">Rhythm</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <Stat label="Avg sentence" value={`${r.stats.avgSentence.toFixed(0)} words`} />
            <Stat label="Length variety" value={r.stats.variation.toFixed(2)} hint="Typical: human 0.46, AI 0.32" />
            <Stat label="Contractions" value={String(r.stats.contractions)} />
            <Stat label="Em dashes" value={String(r.stats.emDashes)} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2.5 py-2" title={hint}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums text-foreground">{value}</dd>
      {hint && <dd className="text-[10px] text-muted-foreground mt-0.5">{hint}</dd>}
    </div>
  );
}

function SignalList({ items, empty, tone }: { items: { gram: string; weight: number; count: number }[]; empty: string; tone: "ai" | "human" }) {
  if (!items.length) return <p className="mt-2 text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((i) => Math.abs(i.weight)));
  return (
    <ul className="mt-3 flex flex-col gap-1.5">
      {items.slice(0, 6).map((i) => (
        <li key={i.gram} className="flex items-center gap-2 text-sm">
          <code className="min-w-0 truncate font-mono text-[12.5px]">“{i.gram}”</code>
          {i.count > 1 && <span className="text-xs text-muted-foreground">×{i.count}</span>}
          <span className="ml-auto h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
            <span className={`block h-full rounded-full ${tone === "ai" ? "bg-[hsl(var(--chart-5))]" : "bg-primary"}`} style={{ width: `${(Math.abs(i.weight) / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function renderHighlights(text: string, sents: { start: number; end: number; p: number }[], thr: number, low: number) {
  const out: React.ReactNode[] = [];
  let pos = 0;
  sents.forEach((s, i) => {
    if (s.start > pos) out.push(text.slice(pos, s.start));
    // short windows regress toward the middle, so "unclear" starts at 0.5 here instead of the page-level band
    const cls = s.p >= thr ? "bg-[hsl(var(--chart-5)/.28)]" : s.p >= Math.max(low, 0.5) ? "bg-[hsl(var(--chart-4)/.18)]" : "";
    out.push(<span key={i} className={`rounded-[3px] ${cls}`} title={`Sentence score ${Math.round(s.p * 100)}`}>{text.slice(s.start, s.end)}</span>);
    pos = s.end;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}
