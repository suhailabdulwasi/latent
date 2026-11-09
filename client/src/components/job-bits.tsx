import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Bookmark, BookmarkCheck, Check, EyeOff, ExternalLink, MapPin, Minus, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { addedWithin, isNew, scoreTone, type Scored } from "@/lib/score";
import { useTrack, useTracked, useUntrack } from "@/hooks/use-data";
import { COMPANY_TYPE_LABEL, type Tracked } from "@shared/schema";
import { format } from "date-fns";

export function companyLine(job: Scored) {
  if (job.kind !== "internship") return job.sector;
  const size = job.companySize ? job.companySize.replace(/ employees$/, "") + " people" : COMPANY_TYPE_LABEL[job.companyType];
  return [job.sector, job.category, size].filter(Boolean).join(" · ");
}

export function TermChips({ job }: { job: Scored }) {
  if (!job.terms.length) return <span className="rounded border border-dashed px-1.5 py-px text-[11px] text-muted-foreground">Term not stated</span>;
  return <>{job.terms.map((t) => (
    <span key={t} className={cn("rounded px-1.5 py-px text-[11px]", t.startsWith("Summer") ? "bg-secondary text-secondary-foreground" : "bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]")}>{t.replace(" 20", " \u2019")}</span>
  ))}</>;
}

export const STATUS_LABEL: Record<string, string> = {
  saved: "Saved", applied: "Applied", interviewing: "Interviewing", offer: "Offer", closed: "Closed", hidden: "Hidden",
};

export function ScoreRing({ score, size = 40 }: { score: number; size?: number }) {
  const tone = scoreTone(score);
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Match ${score} of 100`} data-testid="text-score">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="3.5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3.5" strokeLinecap="round"
          stroke={tone === "strong" ? "hsl(var(--primary))" : tone === "good" ? "hsl(var(--chart-4))" : "hsl(var(--muted-foreground))"}
          strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span className={cn("tnum absolute inset-0 grid place-items-center font-semibold", size < 36 ? "text-[10px]" : size > 48 ? "text-[14px]" : "text-[12px]")}>{score}</span>
    </div>
  );
}

export function ago(iso: string | null) {
  if (!iso) return "—";
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: false }).replace(/ (\w)\w*$/, (_, u) => u === "m" ? "mo" : u);
}

export function postedLabel(iso: string | null) {
  if (!iso) return "Date n/a";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 86400000) return "Today";
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

export function JobMeta({ job, compact }: { job: Scored; compact?: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className={cn(compact && "max-w-[260px] truncate")} title={job.location}>{job.location}</span></span>
      <span className={cn("rounded px-1.5 py-px font-medium", job.workMode === "Remote" ? "bg-primary/15 text-primary" : "bg-secondary text-secondary-foreground")}>{job.workMode}</span>
      {job.salaryText ? (
        <span className="tnum flex items-center gap-1 text-foreground/90"><Wallet className="h-3 w-3" />{job.salaryText}</span>
      ) : (
        <span className="flex items-center gap-1"><Wallet className="h-3 w-3" />Pay not listed</span>
      )}
      <span className="tnum">{postedLabel(job.postedAt)}</span>
      {job.kind === "internship" && job.checkedAt && <span className="tnum" title="Last time the source confirmed this posting open">Checked {format(new Date(job.checkedAt), "MMM d")}</span>}
      {addedWithin(job) ? (
        <span className="rounded bg-[hsl(var(--chart-2)/0.15)] px-1.5 py-px font-medium text-[hsl(var(--chart-2))]" data-testid="badge-added-today">Added today</span>
      ) : isNew(job) ? (
        <span className="rounded bg-[hsl(var(--chart-2)/0.15)] px-1.5 py-px font-medium text-[hsl(var(--chart-2))]">New</span>
      ) : null}
    </div>
  );
}

export function SaveButton({ job, tracked }: { job: Scored; tracked?: Tracked }) {
  const track = useTrack();
  const untrack = useUntrack();
  const saved = tracked && tracked.status !== "hidden";
  return (
    <Button size="icon" variant="ghost" className={cn("h-8 w-8 shrink-0", saved && "text-primary")}
      aria-label={saved ? "Remove from pipeline" : "Save to pipeline"} data-testid={`button-save-${job.id}`}
      onClick={(e) => {
        e.stopPropagation();
        if (saved) untrack.mutate(job.id);
        else track.mutate({ jobId: job.id, status: "saved", title: job.title, company: job.company, url: job.url, location: job.location });
      }}>
      {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
    </Button>
  );
}

export function JobDetail({ job }: { job: Scored }) {
  const { map } = useTracked();
  const t = map.get(job.id);
  const track = useTrack();
  const untrack = useUntrack();
  const [notes, setNotes] = useState(t?.notes ?? "");
  useEffect(() => setNotes(t?.notes ?? ""), [job.id, t?.notes]);
  const hasDesc = job.source !== "Simplify";
  const desc = useQuery<{ description: string }>({ queryKey: ["/api/jobs", job.id, "description"], enabled: hasDesc });
  const base = { jobId: job.id, title: job.title, company: job.company, url: job.url, location: job.location };

  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid={`panel-job-${job.id}`}>
      <div className="flex items-start gap-3">
        <ScoreRing score={job.score} size={52} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">
            {job.kind === "internship"
              ? <>{job.company} · {companyLine(job)}{job.terms.length ? ` · ${job.terms.join(", ")}` : ""}</>
              : <>{job.company} · {job.sector}{job.stage && <> · <span title="Approximate funding stage">{job.stage}</span></>}</>}
          </div>
          <h2 className="mt-0.5 text-lg font-semibold leading-snug [overflow-wrap:anywhere]" data-testid="text-detail-title">{job.title}</h2>
          <div className="mt-1.5"><JobMeta job={job} /></div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild data-testid="link-apply">
          <a href={job.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />Apply on {job.company}</a>
        </Button>
        <Select value={t && t.status !== "hidden" ? t.status : "none"}
          onValueChange={(v) => (v === "none" ? untrack.mutate(job.id) : track.mutate({ ...base, status: v, notes }))}>
          <SelectTrigger className="w-[150px]" data-testid="select-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not tracked</SelectItem>
            {["saved", "applied", "interviewing", "offer", "closed"].map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" onClick={() => (t?.status === "hidden" ? untrack.mutate(job.id) : track.mutate({ ...base, status: "hidden" }))} data-testid="button-hide">
          <EyeOff className="h-4 w-4" />{t?.status === "hidden" ? "Unhide" : "Not for me"}
        </Button>
      </div>

      {job.kind === "internship" && (
        <section className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-card p-4 text-sm" data-testid="section-intern-facts">
          <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Term</div>{job.terms.length ? job.terms.join(", ") : "Not stated"}</div>
          <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Company size</div>{job.companySize ?? COMPANY_TYPE_LABEL[job.companyType]}</div>
          <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pay</div>{job.salaryText ?? "Not listed"}</div>
          <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Last checked open</div>{job.checkedAt ? format(new Date(job.checkedAt), "MMM d, yyyy") : "—"}</div>
          {job.degrees.length > 0 && <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Degrees</div>{job.degrees.join(", ")}</div>}
          {job.sponsorship && <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sponsorship</div>{job.sponsorship}</div>}
        </section>
      )}

      <section className="rounded-lg border bg-card p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Why this score</h3>
        <ul className="space-y-1.5 text-sm">
          {job.reasons.map((r) => <li key={r} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{r}</li>)}
          {job.gaps.map((r) => <li key={r} className="flex gap-2 text-muted-foreground"><Minus className="mt-0.5 h-4 w-4 shrink-0" />{r}</li>)}
        </ul>
        {job.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.skills.map((s) => (
              <span key={s} className={cn("rounded border px-2 py-0.5 text-xs", job.matchedSkills.includes(s) ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground")}>{s}</span>
            ))}
          </div>
        )}
      </section>

      {t && t.status !== "hidden" && (
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</h3>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Referral, recruiter name, next step…"
            onBlur={() => notes !== t.notes && track.mutate({ ...base, status: t.status, notes })} data-testid="input-notes" />
        </section>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</h3>
          <span className="text-[11px] text-muted-foreground">Source: {job.source === "Simplify" ? "SimplifyJobs list" : `${job.source} job board`} · {job.department || job.category}</span>
        </div>
        {!hasDesc ? (
          <p className="text-sm text-muted-foreground">This listing comes from the SimplifyJobs internship list, which links to the company's own posting. Open it for the full description, dates and requirements.</p>
        ) : desc.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-3.5" style={{ width: `${70 + ((i * 37) % 30)}%` }} />)}</div>
        ) : desc.data ? (
          <div className="whitespace-pre-line text-sm leading-relaxed text-foreground/85 [overflow-wrap:anywhere]" data-testid="text-description">{desc.data.description}</div>
        ) : (
          <p className="text-sm text-muted-foreground">Description unavailable. Open the posting for details.</p>
        )}
      </section>
    </div>
  );
}
