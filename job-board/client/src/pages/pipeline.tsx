import { useMemo, useState } from "react";
import { ExternalLink, Trash2, ArrowRight, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useScoredJobs, useTrack, useTracked, useUntrack } from "@/hooks/use-data";
import { JobDetail, ScoreRing, STATUS_LABEL } from "@/components/job-bits";
import { STATUSES } from "@shared/schema";
import { formatDistanceToNowStrict } from "date-fns";

export default function PipelinePage() {
  const { tracked, isLoading } = useTracked();
  const { jobs } = useScoredJobs();
  const track = useTrack();
  const untrack = useUntrack();
  const [open, setOpen] = useState<string | null>(null);
  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const active = tracked.filter((t) => t.status !== "hidden");
  const hidden = tracked.filter((t) => t.status === "hidden");
  const openJob = open ? byId.get(open) : undefined;

  if (!isLoading && active.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-dashed p-10 text-center">
        <p className="font-medium">Your pipeline is empty</p>
        <p className="mt-1 text-sm text-muted-foreground">Bookmark roles on the board to track them here.</p>
        <Button asChild size="sm" className="mt-4"><Link href="/" data-testid="link-go-board">Browse roles</Link></Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Pipeline</h1>
        <p className="text-sm text-muted-foreground tnum">
          {active.length} tracked · {active.filter((t) => t.status === "applied" || t.status === "interviewing" || t.status === "offer").length} in motion
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {STATUSES.map((s, si) => {
          const items = active.filter((t) => t.status === s).sort((a, b) => b.updatedAt - a.updatedAt);
          return (
            <section key={s} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card/50 p-2.5" data-testid={`column-${s}`}>
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-medium">{STATUS_LABEL[s]}</h2>
                <span className="tnum text-xs text-muted-foreground">{items.length}</span>
              </div>
              {items.length === 0 && <p className="px-1 py-3 text-xs text-muted-foreground">Nothing here yet</p>}
              {items.map((t) => {
                const j = byId.get(t.jobId);
                const move = (d: number) => track.mutate({ ...t, status: STATUSES[si + d] });
                return (
                  <div key={t.jobId} className="rounded-md border bg-card p-3" data-testid={`card-tracked-${t.jobId}`}>
                    <button className="flex w-full items-start gap-2 text-left" onClick={() => j && setOpen(t.jobId)} data-testid={`button-open-${t.jobId}`}>
                      {j && <ScoreRing score={j.score} size={32} />}
                      <div className="min-w-0">
                        <div className="truncate text-xs text-muted-foreground">{t.company}</div>
                        <div className="text-sm font-medium leading-snug [overflow-wrap:anywhere]">{t.title}</div>
                      </div>
                    </button>
                    {t.notes && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{t.notes}</p>}
                    {!j && <p className="mt-2 text-xs text-[hsl(var(--chart-4))]">Posting no longer listed</p>}
                    <div className="mt-2 flex items-center gap-1">
                      <span className="mr-auto text-[11px] text-muted-foreground">{formatDistanceToNowStrict(new Date(t.updatedAt))} ago</span>
                      {si > 0 && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move back" onClick={() => move(-1)} data-testid={`button-back-${t.jobId}`}><ArrowLeft className="h-3.5 w-3.5" /></Button>}
                      {si < STATUSES.length - 1 && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move to ${STATUS_LABEL[STATUSES[si + 1]]}`} onClick={() => move(1)} data-testid={`button-forward-${t.jobId}`}><ArrowRight className="h-3.5 w-3.5" /></Button>}
                      {/^https?:\/\//i.test(t.url) && <Button asChild size="icon" variant="ghost" className="h-7 w-7"><a href={t.url} target="_blank" rel="noopener noreferrer" aria-label="Open posting"><ExternalLink className="h-3.5 w-3.5" /></a></Button>}
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove" onClick={() => untrack.mutate(t.jobId)} data-testid={`button-remove-${t.jobId}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      {hidden.length > 0 && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">{hidden.length} hidden roles</summary>
          <ul className="mt-2 space-y-1">
            {hidden.map((h) => (
              <li key={h.jobId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{h.company} — {h.title}</span>
                <Button size="sm" variant="ghost" onClick={() => untrack.mutate(h.jobId)} data-testid={`button-unhide-${h.jobId}`}>Unhide</Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Sheet open={!!openJob} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto scroll-contain sm:max-w-xl">
          <SheetHeader className="sr-only"><SheetTitle>Role details</SheetTitle></SheetHeader>
          {openJob && <div className="pt-4"><JobDetail job={openJob} /></div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
