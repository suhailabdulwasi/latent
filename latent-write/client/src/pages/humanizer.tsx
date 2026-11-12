import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Copy, Check, RefreshCw, Wand2, Info, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { ScorePill } from "@/components/score";
import { useModel } from "@/lib/model";
import { wordDiff } from "@/lib/diff";
import { humanize, type Tone } from "@shared/humanize";
import { score, words } from "@shared/core";
import samples from "@/data/samples.json";

const STRENGTHS = [{ v: "1", label: "Light" }, { v: "2", label: "Medium" }, { v: "3", label: "Strong" }];
const TONES: { v: Tone; label: string }[] = [{ v: "casual", label: "Casual" }, { v: "standard", label: "Standard" }, { v: "academic", label: "Academic" }];

export default function Humanizer() {
  const m = useModel();
  const [text, setText] = useState("");
  const [tone, setTone] = useState<Tone>("standard");
  const [strength, setStrength] = useState<1 | 2 | 3>(3);
  const [seed, setSeed] = useState(1);
  const [run, setRun] = useState<{ input: string; tone: Tone; strength: 1 | 2 | 3; seed: number } | null>(null);
  const [view, setView] = useState<"result" | "changes">("result");
  const [copied, setCopied] = useState(false);
  const n = useMemo(() => words(text).length, [text]);


  const go = (nextSeed = seed) => { setSeed(nextSeed); setRun({ input: text, tone, strength, seed: nextSeed }); setCopied(false); };
  // Humanize tries several seeds and keeps the one the detector scores lowest.
  const best = useMemo(() => {
    if (!run || !m) return null;
    const tries = Array.from({ length: 10 }, (_, i) => run.seed - 1 + i);
    let out: ReturnType<typeof humanize> | null = null, bp = Infinity, bSeed = run.seed;
    for (const sd of tries) {
      const h = humanize(run.input, { tone: run.tone, strength: run.strength, seed: sd });
      const p = score(m, h.text).p;
      if (p < bp) { bp = p; out = h; bSeed = sd; }
    }
    return { out: out!, seed: bSeed, p: bp };
  }, [run, m]);
  const out = best?.out ?? null;
  const scores = useMemo(() => (m && run && out ? { before: score(m, run.input), after: score(m, out.text) } : null), [m, run, out]);
  const diff = useMemo(() => (run && out ? wordDiff(run.input.trim(), out.text) : []), [run, out]);
  const changed = diff.filter((d) => d.type === "add").reduce((a, d) => a + words(d.text).length, 0);
  const copy = async () => {
    if (!out) return;
    try { await navigator.clipboard.writeText(out.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader title="AI Humanizer" desc="Edits out the habits that make text read as machine-written: stock phrases, filler, em dashes, list formatting, stiff transitions, uniform sentences and missing hedges. Humanize tries ten rewrite variants and shows the one our detector scores lowest. Your ideas stay the same." />

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Tone</span>
          <ToggleGroup type="single" value={tone} onValueChange={(v) => v && setTone(v as Tone)} variant="outline" size="sm" data-testid="toggle-tone">
            {TONES.map((t) => <ToggleGroupItem key={t.v} value={t.v} data-testid={`tone-${t.v}`} className="px-3 text-xs">{t.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Strength</span>
          <ToggleGroup type="single" value={String(strength)} onValueChange={(v) => v && setStrength(Number(v) as 1 | 2 | 3)} variant="outline" size="sm" data-testid="toggle-strength">
            {STRENGTHS.map((s) => <ToggleGroupItem key={s.v} value={s.v} data-testid={`strength-${s.v}`} className="px-3 text-xs">{s.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste AI-written or stiff text here."
            className="min-h-[380px] resize-y font-serif text-[15px] leading-relaxed" data-testid="input-humanizer" aria-label="Text to humanize" />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => go(1)} disabled={n < 5} data-testid="button-humanize"><Wand2 className="h-4 w-4" />Humanize</Button>
            <Button variant="outline" size="sm" onClick={() => { setText(samples.ai.text); setRun(null); }} data-testid="button-sample">Load sample</Button>
            {text && <Button variant="ghost" size="sm" onClick={() => { setText(""); setRun(null); }} data-testid="button-clear">Clear</Button>}
            <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums" data-testid="text-wordcount">{n} words</span>
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-live="polite">
          {!out ? (
            <div className="flex min-h-[380px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center" data-testid="empty-humanizer">
              <Wand2 className="h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Your rewrite appears here</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">Pick a tone and strength, paste text, then select Humanize.</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-card">
                <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
                  <Button variant={view === "result" ? "secondary" : "ghost"} size="sm" onClick={() => setView("result")} data-testid="tab-result">Result</Button>
                  <Button variant={view === "changes" ? "secondary" : "ghost"} size="sm" onClick={() => setView("changes")} data-testid="tab-changes">Changes <span className="ml-1 font-mono text-[11px] text-muted-foreground">{changed}</span></Button>
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => go(seed + 1)} data-testid="button-another" title="Same settings, a different set of variants"><RefreshCw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Another version</span><span className="sm:hidden">Retry</span></Button>
                    <Button variant="ghost" size="sm" onClick={copy} data-testid="button-copy">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</Button>
                  </div>
                </div>
                <div className="min-h-[320px] max-h-[520px] overflow-auto whitespace-pre-wrap p-4 font-serif text-[15px] leading-[1.8]" data-testid="text-output">
                  {view === "result" ? out.text : diff.map((d, i) => d.type === "same" ? <span key={i}>{d.text}</span> :
                    d.type === "add" ? <ins key={i} className="rounded-[3px] bg-primary/20 no-underline">{d.text}</ins> :
                    <del key={i} className="mr-0.5 text-muted-foreground/70 decoration-[hsl(var(--chart-5))]">{d.text}</del>)}
                </div>
              </div>

              {scores && (
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <ScorePill m={m!} p={scores.before.p} thr={scores.before.threshold} label="Detector score before" testid="score-before" />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <ScorePill m={m!} p={scores.after.p} thr={scores.after.threshold} label="After" testid="score-after" />
                </div>
              )}

              {out.edits.length > 0 ? (
                <div className="rounded-lg border bg-card p-4" data-testid="card-edits">
                  <h2 className="text-sm font-semibold">What changed</h2>
                  <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {out.edits.map((e) => (
                      <li key={e.rule} className="flex justify-between gap-2"><span className="text-muted-foreground">{e.rule}</span><span className="font-mono tabular-nums">{e.count}</span></li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No common AI habits found to edit at this strength. Try Strong.</p>
              )}
            </>
          )}
        </section>
      </div>

      <div className="mt-8 flex gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground" data-testid="text-caveat">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          This humanizer is rule-based. It rewrites phrasing and structure but never adds facts or ideas, so always read the result before using it.
          It removes surface tells, but sentence-level patterns remain, and strong detectors (including ours) still catch much of the edited text.
          {" "}<Link href="/accuracy" className="underline underline-offset-2 hover:text-foreground" data-testid="link-humanizer-accuracy">See the test results</Link>. Follow your school's or employer's rules on AI use.
        </p>
      </div>
    </div>
  );
}
