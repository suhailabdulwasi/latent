import type { ModelFile } from "@shared/core";

export type Verdict = "human" | "unclear" | "ai";
export function verdictOf(m: ModelFile, p: number, thr: number = m.calibration.threshold): Verdict {
  return p >= thr ? "ai" : p < Math.min(m.calibration.bands.low, thr) ? "human" : "unclear";
}
export const VERDICT_LABEL: Record<Verdict, string> = { human: "Likely human", unclear: "Unclear", ai: "Likely AI" };
export const VERDICT_TEXT: Record<Verdict, string> = {
  human: "Reads like human writing. Few of the patterns common in AI text.",
  unclear: "Mixed signals. Could be human, edited AI text, or a short sample.",
  ai: "Shows many patterns common in AI-generated text.",
};
export const verdictColor: Record<Verdict, string> = {
  human: "text-primary",
  unclear: "text-amber-700 dark:text-[hsl(var(--chart-4))]",
  ai: "text-[hsl(340_60%_40%)] dark:text-[hsl(var(--chart-5))]",
};

// Horizontal scale with the three bands and a marker for the score.
export function Gauge({ m, p, thr = m.calibration.threshold, testid = "gauge" }: { m: ModelFile; p: number; thr?: number; testid?: string }) {
  const hi = thr * 100, low = Math.min(m.calibration.bands.low * 100, hi);
  return (
    <div className="w-full" data-testid={testid}>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 bg-primary/35" style={{ width: `${low}%` }} />
        <div className="absolute inset-y-0 bg-[hsl(var(--chart-4)/.35)]" style={{ left: `${low}%`, width: `${hi - low}%` }} />
        <div className="absolute inset-y-0 right-0 bg-[hsl(var(--chart-5)/.4)]" style={{ left: `${hi}%` }} />
      </div>
      <div className="relative h-0">
        <div className="absolute -top-[15px] h-[20px] w-[3px] -translate-x-1/2 rounded-full bg-foreground shadow transition-[left] duration-500" style={{ left: `${Math.min(99.5, Math.max(0.5, p * 100))}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>Human</span><span>Unclear</span><span>AI</span>
      </div>
    </div>
  );
}

export function ScorePill({ m, p, thr, label, testid }: { m: ModelFile; p: number; thr?: number; label: string; testid: string }) {
  const v = verdictOf(m, p, thr);
  return (
    <div className="rounded-lg border bg-card px-4 py-3" data-testid={testid}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-xl font-semibold tabular-nums">{Math.round(p * 100)}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
        <span className={`ml-auto text-sm font-medium ${verdictColor[v]}`}>{VERDICT_LABEL[v]}</span>
      </div>
    </div>
  );
}
