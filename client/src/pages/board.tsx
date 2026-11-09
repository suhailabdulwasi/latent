import { useMemo, useState, useEffect } from "react";
import { Search, SlidersHorizontal, X, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CATEGORIES, SENIORITIES, STAGES, INTERN_TERMS, COMPANY_TYPES, COMPANY_TYPE_LABEL } from "@shared/schema";
import { useProfile, useScoredJobs, useTracked } from "@/hooks/use-data";
import { addedWithin, isNew, median, type Scored } from "@/lib/score";
import { JobDetail, JobMeta, SaveButton, ScoreRing, TermChips, companyLine } from "@/components/job-bits";

type Sort = "match" | "newest" | "added" | "pay";
const PAGE = 40;

function useIsDesktop() {
  const [d, setD] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const f = () => setD(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return d;
}

function Chip({ active, onClick, children, testid }: { active: boolean; onClick: () => void; children: React.ReactNode; testid: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={active}
      className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-primary/50 bg-primary/15 text-primary" : "text-muted-foreground hover:border-foreground/30 hover:text-foreground")}>
      {children}
    </button>
  );
}

function Kpi({ label, value, hint, testid }: { label: string; value: string; hint?: string; testid: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-4 py-3 last:col-span-2 md:last:col-span-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tnum mt-0.5 text-xl font-semibold tracking-tight" data-testid={testid}>{value}</div>
      {hint && <div className="truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function InternBoardPage() { return <BoardPage kind="internship" />; }
export function FullTimeBoardPage() { return <BoardPage kind="fulltime" />; }

function checkedWithin(j: Scored, days: number) {
  return !!j.checkedAt && Date.now() - new Date(j.checkedAt).getTime() < days * 86400000;
}

export default function BoardPage({ kind = "internship" }: { kind?: "internship" | "fulltime" }) {
  const intern = kind === "internship";
  const { jobs: all, data, isLoading } = useScoredJobs();
  const jobs = useMemo(() => all.filter((j) => j.kind === kind), [all, kind]);
  const { profile } = useProfile();
  const { map } = useTracked();
  const desktop = useIsDesktop();

  const [q, setQ] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [seniority, setSeniority] = useState("any");
  const [mode, setMode] = useState("any");
  const [stage, setStage] = useState("any");
  const [usOnly, setUsOnly] = useState(true);
  const [payOnly, setPayOnly] = useState(false);
  const [fresh, setFresh] = useState("any");
  const [sort, setSort] = useState<Sort>(intern ? "added" : "match");
  const [term, setTerm] = useState("any");
  const [size, setSize] = useState("mine");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [showOutside, setShowOutside] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = jobs.filter((j) => {
      if (!showHidden && map.get(j.id)?.status === "hidden") return false;
      if (intern) {
        if (!showOutside && !j.eligible) return false;
        if (term === "none" && j.terms.length) return false;
        if (term !== "any" && term !== "none" && !j.terms.includes(term)) return false;
        if (size === "mine" && !profile.companyTypes.includes(j.companyType)) return false;
        if (size !== "mine" && size !== "any" && j.companyType !== size) return false;
        if (remoteOnly && j.workMode !== "Remote") return false;
      }
      if (cats.length && !cats.includes(j.category)) return false;
      if (seniority !== "any" && j.seniority !== seniority) return false;
      if (mode !== "any" && j.workMode !== mode) return false;
      if (stage !== "any" && j.stage !== stage) return false;
      if (usOnly && !j.usBased && (j.intlOnly || j.workMode !== "Remote")) return false;
      if (payOnly && (intern ? j.payHourlyMax == null : j.salaryMaxK == null)) return false;
      if (fresh === "today" && !addedWithin(j, 24)) return false;
      if (fresh === "7d" && !isNew(j, 7)) return false;
      if (fresh === "checked7" && !checkedWithin(j, 7)) return false;
      if (fresh === "30d" && !isNew(j, 30)) return false;
      if (terms.length) {
        const hay = `${j.title} ${j.company} ${j.location} ${j.skills.join(" ")} ${j.sector} ${j.category} ${j.terms.join(" ")} ${j.workMode} ${j.companyType}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    const t = (j: Scored) => (j.postedAt ? new Date(j.postedAt).getTime() : 0);
    out.sort((a, b) =>
      sort === "match" ? b.score - a.score || t(b) - t(a)
      : sort === "newest" ? t(b) - t(a)
      : sort === "added" ? new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime() || b.score - a.score
      : intern ? (b.payHourlyMax ?? -1) - (a.payHourlyMax ?? -1) || b.score - a.score
      : (b.salaryMaxK ?? -1) - (a.salaryMaxK ?? -1));
    return out;
  }, [jobs, map, q, cats, seniority, mode, stage, usOnly, payOnly, fresh, sort, intern, term, size, remoteOnly, showOutside, showHidden, profile]);

  useEffect(() => setLimit(PAGE), [q, cats, seniority, mode, stage, usOnly, payOnly, fresh, sort, term, size, remoteOnly, showOutside, showHidden]);
  useEffect(() => {
    if (desktop && filtered.length && (!selectedId || !filtered.some((j) => j.id === selectedId))) setSelectedId(filtered[0].id);
  }, [desktop, filtered, selectedId]);

  const selected = filtered.find((j) => j.id === selectedId) ?? jobs.find((j) => j.id === selectedId) ?? null;

  const kpis = useMemo(() => {
    const strong = filtered.filter((j) => j.score >= 75).length;
    const week = filtered.filter((j) => isNew(j)).length;
    const today = filtered.filter((j) => addedWithin(j, 24)).length;
    const mids = intern
      ? filtered.filter((j) => j.payHourlyMin && j.payHourlyMax).map((j) => Math.round((j.payHourlyMin! + j.payHourlyMax!) / 2))
      : filtered.filter((j) => j.salaryMinK && j.salaryMaxK).map((j) => Math.round((j.salaryMinK! + j.salaryMaxK!) / 2));
    const companies = new Set(filtered.map((j) => j.company)).size;
    const checked = filtered.filter((j) => checkedWithin(j, 7)).length;
    return { strong, week, today, med: median(mids), companies, paid: mids.length, checked };
  }, [filtered, intern]);

  const activeCount = cats.length + [seniority, mode, stage, term].filter((x) => x !== "any").length + (payOnly ? 1 : 0) + (fresh !== "any" ? 1 : 0) + (usOnly ? 0 : 1)
    + (size !== "mine" ? 1 : 0) + (remoteOnly ? 1 : 0) + (showOutside ? 1 : 0) + (showHidden ? 1 : 0);
  const clear = () => { setCats([]); setSeniority("any"); setMode("any"); setStage("any"); setPayOnly(false); setFresh("any"); setUsOnly(true); setQ("");
    setTerm("any"); setSize("mine"); setRemoteOnly(false); setShowOutside(false); setShowHidden(false); };
  const hiddenOutside = intern ? jobs.filter((j) => !j.eligible).length : 0;
  const applyTargets = () => setCats(profile.categories);

  const filtersUI = (
    <div className="flex flex-wrap items-center gap-2">
      {intern && (<>
      <Select value={term} onValueChange={setTerm}>
        <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="select-term"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="any">Any term</SelectItem>{INTERN_TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}<SelectItem value="none">Term not stated</SelectItem></SelectContent>
      </Select>
      <Select value={size} onValueChange={setSize}>
        <SelectTrigger className="h-8 w-[170px] text-xs" data-testid="select-size"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="mine">My company sizes</SelectItem>
          <SelectItem value="any">Any company size</SelectItem>
          {COMPANY_TYPES.map((t) => <SelectItem key={t} value={t}>{COMPANY_TYPE_LABEL[t]}</SelectItem>)}
        </SelectContent>
      </Select>
      </>)}
      {!intern && <Select value={seniority} onValueChange={setSeniority}>
        <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-seniority"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="any">Any level</SelectItem>{SENIORITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>}
      <Select value={mode} onValueChange={setMode}>
        <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-mode"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="any">Any work mode</SelectItem>{["Remote", "Hybrid", "Onsite"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>
      {!intern && <Select value={stage} onValueChange={setStage}>
        <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="select-stage"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="any">Any stage</SelectItem>{STAGES.map((s) => <SelectItem key={s} value={s}>{s === "Early" ? "Early (Seed–B)" : s === "Growth" ? "Growth (C+)" : "Late-stage"}</SelectItem>)}</SelectContent>
      </Select>}
      <Select value={fresh} onValueChange={setFresh}>
        <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="select-fresh"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any date</SelectItem>
          <SelectItem value="today">Added in last 24h</SelectItem>
          <SelectItem value="7d">Posted last 7 days</SelectItem>
          <SelectItem value="30d">Posted last 30 days</SelectItem>
          <SelectItem value="checked7">Checked open this week</SelectItem>
        </SelectContent>
      </Select>
      {intern
        ? <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={remoteOnly} onCheckedChange={setRemoteOnly} data-testid="switch-remote-only" />Remote only</label>
        : <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={usOnly} onCheckedChange={setUsOnly} data-testid="switch-us" />US or remote</label>}
      <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={payOnly} onCheckedChange={setPayOnly} data-testid="switch-pay" />Pay listed</label>
      {intern && <label className="flex items-center gap-2 text-xs text-muted-foreground" title="Off-cycle terms that are on-site outside your school city"><Switch checked={showOutside} onCheckedChange={setShowOutside} data-testid="switch-outside" />Outside my term rules{hiddenOutside ? ` (${hiddenOutside})` : ""}</label>}
      <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} data-testid="check-hidden" />Show "Not for me"</label>

      {activeCount > 0 && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clear} data-testid="button-clear"><X className="h-3.5 w-3.5" />Clear</Button>}
    </div>
  );

  const loading = isLoading || (!data?.syncedAt && data?.syncing !== false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" data-testid="text-scope">
        {intern
          ? <>ML, AI and data science internships. Summer 2027 can be anywhere in the US; school terms (Fall, Winter, Spring 2027) only show when they're remote or in {profile.schoolCities.join(" / ") || "your school city"}. Defaults to startups and small companies; newest additions first.</>
          : <>Full-time ML, AI and data roles at {data?.companiesTotal ?? 75} AI startups, read straight from their job boards.</>}
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Roles in view" value={loading ? "—" : filtered.length.toLocaleString()} hint={`${kpis.companies} companies`} testid="kpi-roles" />
        <Kpi label="Strong matches" value={loading ? "—" : kpis.strong.toLocaleString()} hint="Score 75+" testid="kpi-strong" />
        <Kpi label="Added in last 24h" value={loading ? "—" : kpis.today.toLocaleString()} hint="New to the board" testid="kpi-today" />
        {intern
          ? <Kpi label="Checked this week" value={loading ? "—" : kpis.checked.toLocaleString()} hint="Confirmed open in the last 7 days" testid="kpi-checked" />
          : <Kpi label="Posted this week" value={loading ? "—" : kpis.week.toLocaleString()} testid="kpi-new" />}
        <Kpi label="Median pay midpoint" value={loading || !kpis.med ? "—" : intern ? `$${kpis.med}/hr` : `$${kpis.med}K`} hint={`${kpis.paid} roles list ${intern ? "hourly " : ""}pay`} testid="kpi-pay" />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={intern ? "Search title, company, tag (e.g. LLM, remote, Spring 2027)" : "Search title, company, skill (e.g. pytorch inference)"} className="h-9 pl-8" data-testid="input-search" />
          </div>
          <div className="flex items-center gap-2">
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger className="h-9 w-[200px] text-xs" data-testid="select-sort"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="match">Sort: Best match</SelectItem>
                <SelectItem value="added">{intern ? "Sort: Newest to the board" : "Sort: Just added"}</SelectItem>
                <SelectItem value="newest">Sort: Newest posted</SelectItem>
                <SelectItem value="pay">Sort: Highest pay</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9 md:hidden" onClick={() => setShowFilters((s) => !s)} data-testid="button-filters">
              <SlidersHorizontal className="h-4 w-4" />Filters{activeCount ? ` (${activeCount})` : ""}
            </Button>
          </div>
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          <Chip active={cats.length === 0} onClick={() => setCats([])} testid="chip-all">All roles</Chip>
          <Chip active={cats.length > 0 && cats.length === profile.categories.length && profile.categories.every((c) => cats.includes(c))} onClick={applyTargets} testid="chip-targets">
            <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" />My targets</span>
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={cats.includes(c)} testid={`chip-${c.replace(/\W+/g, "-").toLowerCase()}`}
              onClick={() => setCats((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))}>{c}</Chip>
          ))}
        </div>
        <div className={cn("md:block", showFilters ? "block" : "hidden")}>{filtersUI}</div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)]">
        <div className="flex min-w-0 flex-col gap-2" data-testid="list-jobs">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 rounded-lg border bg-card p-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-3/5" /><Skeleton className="h-3 w-4/5" /></div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <p className="font-medium">No roles match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Loosen a filter or search a broader term.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={clear} data-testid="button-empty-clear">Clear filters</Button>
            </div>
          ) : (
            <>
              {filtered.slice(0, limit).map((j) => {
                const t = map.get(j.id);
                return (
                  <div key={j.id} role="button" tabIndex={0} data-testid={`row-job-${j.id}`}
                    onClick={() => setSelectedId(j.id)} onKeyDown={(e) => e.key === "Enter" && setSelectedId(j.id)}
                    className={cn("job-row group flex cursor-pointer gap-3 rounded-lg border bg-card p-3.5 transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      desktop && selectedId === j.id && "border-primary/60 bg-primary/[0.04]")}>
                    <ScoreRing score={j.score} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate font-medium text-foreground/80">{j.company}</span>
                        <span className="hidden truncate sm:inline">· {intern ? companyLine(j) : j.sector}</span>
                        {!intern && j.stage && <span className="shrink-0 rounded border px-1.5 text-[10px] uppercase tracking-wide">{j.stage}</span>}
                        {intern && j.companyType === "Startup" && <span className="shrink-0 rounded border border-primary/40 px-1.5 text-[10px] uppercase tracking-wide text-primary">Startup</span>}
                        {t && t.status !== "hidden" && <span className="shrink-0 rounded bg-primary/15 px-1.5 text-[10px] font-medium uppercase tracking-wide text-primary">{t.status}</span>}
                      </div>
                      <div className="mt-0.5 text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{j.title}</div>
                      <div className="mt-1.5"><JobMeta job={j} compact /></div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="rounded bg-secondary px-1.5 py-px text-[11px] text-secondary-foreground">{j.category}</span>
                        {intern ? <TermChips job={j} /> : <span className="rounded bg-secondary px-1.5 py-px text-[11px] text-secondary-foreground">{j.seniority}</span>}
                        {j.skills.slice(0, 4).map((s) => (
                          <span key={s} className={cn("rounded border px-1.5 py-px text-[11px]", j.matchedSkills.includes(s) ? "border-primary/40 text-primary" : "text-muted-foreground")}>{s}</span>
                        ))}
                      </div>
                    </div>
                    <SaveButton job={j} tracked={t} />
                  </div>
                );
              })}
              {limit < filtered.length && (
                <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)} data-testid="button-more">
                  Show more · {filtered.length - limit} left
                </Button>
              )}
            </>
          )}
        </div>

        {desktop && (
          <aside className="sticky top-[72px] max-h-[calc(100dvh-88px)] overflow-y-auto scroll-contain rounded-lg border bg-card/40 p-5" data-testid="panel-detail">
            {selected ? <JobDetail job={selected} /> : <p className="text-sm text-muted-foreground">Select a role to see details.</p>}
          </aside>
        )}
      </div>

      {!desktop && (
        <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
          <SheetContent side="bottom" className="h-[88dvh] overflow-y-auto scroll-contain">
            <SheetHeader className="sr-only"><SheetTitle>Role details</SheetTitle></SheetHeader>
            {selected && <div className="pt-4"><JobDetail job={selected} /></div>}
          </SheetContent>
        </Sheet>
      )}

      <p className="text-[11px] text-muted-foreground">
        {intern
          ? <>Internships come from the community-maintained <a className="underline" href="https://github.com/SimplifyJobs/Summer2027-Internships" target="_blank" rel="noopener noreferrer">SimplifyJobs Summer 2027 list</a> (which also tracks off-cycle terms) plus intern postings on the job boards of {data?.companiesTotal ?? 75} AI startups. "Checked" is the last time the source confirmed the posting open. Company sizes come from public headcount ranges and are approximate. Everything re-syncs every {data?.refreshHours ?? 3} hours; match scores use your <Link href="/profile" className="underline">profile</Link>.</>
          : <>Live from public Greenhouse and Ashby job boards of {data?.companiesTotal ?? 75} AI startups, re-checked every {data?.refreshHours ?? 3} hours and whenever the board is opened after a quiet stretch. Stage labels are approximate. Match score is computed from your <Link href="/profile" className="underline">profile</Link>.</>}
      </p>
    </div>
  );
}
