import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { useScoredJobs, useProfile } from "@/hooks/use-data";
import { CATEGORIES, STAGES, INTERN_TERMS, COMPANY_TYPES, COMPANY_TYPE_LABEL } from "@shared/schema";
import { median } from "@/lib/score";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const tick = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
const tip = {
  contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--popover-border))", borderRadius: 6, fontSize: 12, color: "hsl(var(--popover-foreground))" },
  cursor: { fill: "hsl(var(--muted) / 0.5)" },
};

function Panel({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card p-4", className)}>
      <h2 className="text-sm font-medium">{title}</h2>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function HBar({ data, height, color = "hsl(var(--chart-1))", highlight, unit }: { data: { name: string; value: number }[]; height: number; color?: string; highlight?: Set<string>; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
        <XAxis type="number" tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => (unit ? `${unit}${v}K` : v)} />
        <YAxis type="category" dataKey="name" width={150} tick={tick} axisLine={false} tickLine={false} interval={0} />
        <Tooltip {...tip} formatter={(v: number) => [unit ? `${unit}${v}K` : v, unit ? "Median midpoint" : "Roles"]} />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={18} animationDuration={500}>
          {data.map((d) => <Cell key={d.name} fill={highlight && !highlight.has(d.name) ? "hsl(var(--muted-foreground) / 0.45)" : color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function InsightsPage() {
  const { jobs: all, data, isLoading } = useScoredJobs();
  const { profile } = useProfile();
  const [scope, setScope] = useState<"all" | "targets">("targets");
  const [kind, setKind] = useState<"internship" | "fulltime">("internship");
  const intern = kind === "internship";
  const jobs = useMemo(() => all.filter((j) => j.kind === kind && (!intern || j.eligible)), [all, kind, intern]);
  const base = useMemo(() => (scope === "all" ? jobs : jobs.filter((j) => profile.categories.includes(j.category))), [jobs, scope, profile]);

  const s = useMemo(() => {
    const count = <T extends string>(keys: T[]) => { const m = new Map<string, number>(); keys.forEach((k) => m.set(k, (m.get(k) ?? 0) + 1)); return m; };
    const byCat = CATEGORIES.map((c) => ({ name: c, value: base.filter((j) => j.category === c).length }));
    const skillMap = count(base.flatMap((j) => j.skills));
    const skills = Array.from(skillMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([name, value]) => ({ name, value }));
    const compMap = count(base.map((j) => j.company));
    const companies = Array.from(compMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([name, value]) => ({ name, value }));
    const pay = CATEGORIES.map((c) => {
      const mids = base.filter((j) => j.category === c && j.salaryMinK && j.salaryMaxK).map((j) => (j.salaryMinK! + j.salaryMaxK!) / 2);
      return { name: c, value: Math.round(median(mids) ?? 0), n: mids.length };
    }).filter((d) => d.n >= 3);
    const modes = ["Remote", "Hybrid", "Onsite"].map((m) => ({ name: m, value: base.filter((j) => j.workMode === m).length }));
    const stages = STAGES.map((st) => ({ name: st, value: base.filter((j) => j.stage === st).length }));
    const early = (intern ? base.filter((j) => j.companyType === "Startup") : base.filter((j) => j.stage === "Early")).sort((a, b) => b.score - a.score).slice(0, 6);
    const terms = [...INTERN_TERMS.map((t) => ({ name: t, value: base.filter((j) => j.terms.includes(t)).length })), { name: "Term not stated", value: base.filter((j) => !j.terms.length).length }];
    const sizes = COMPANY_TYPES.map((t) => ({ name: COMPANY_TYPE_LABEL[t], value: base.filter((j) => j.companyType === t).length }));
    return { byCat, skills, companies, pay, modes, stages, early, terms, sizes };
  }, [base, intern]);

  const mySkills = new Set(profile.skills);
  const gapSkills = s.skills.filter((x) => !mySkills.has(x.name)).slice(0, 5).map((x) => x.name);

  if (isLoading) return <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72" />)}</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Market insights</h1>
          <p className="text-sm text-muted-foreground tnum">{base.length.toLocaleString()} open {intern ? "internships that fit your term rules" : "full-time roles"} analyzed</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <div className="flex rounded-md border p-0.5 text-xs">
          {(["internship", "fulltime"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} data-testid={`button-kind-${k}`}
              className={cn("rounded px-3 py-1.5", kind === k ? "bg-secondary font-medium" : "text-muted-foreground")}>
              {k === "internship" ? "Internships" : "Full-time"}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border p-0.5 text-xs">
          {(["targets", "all"] as const).map((k) => (
            <button key={k} onClick={() => setScope(k)} data-testid={`button-scope-${k}`}
              className={cn("rounded px-3 py-1.5", scope === k ? "bg-secondary font-medium" : "text-muted-foreground")}>
              {k === "targets" ? "My target roles" : "All ML/AI/data roles"}
            </button>
          ))}
        </div>
        </div>
      </div>

      {!intern && gapSkills.length > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/[0.06] p-4 text-sm" data-testid="text-skill-gap">
          <span className="font-medium">Skill gap to close:</span>{" "}
          <span className="text-muted-foreground">the most-requested skills you haven't listed are </span>
          <span className="font-medium text-primary">{gapSkills.join(", ")}</span>.
        </div>
      )}

      <Panel title="Daily board activity" sub="Internships and full-time roles added and removed per day. Builds up as the board refreshes each day.">
        {(data?.history?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">First sync in progress.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={(data?.history ?? []).slice(-30).map((d) => ({ ...d, label: d.date.slice(5), neg: -d.removed }))} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={36} />
                <Tooltip {...tip} formatter={(v: number, n: string) => [Math.abs(v), n === "added" ? "Added" : "Removed"]} />
                <Bar dataKey="added" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} maxBarSize={22} animationDuration={500} />
                <Bar dataKey="neg" name="removed" fill="hsl(var(--chart-5))" radius={[0, 0, 3, 3]} maxBarSize={22} animationDuration={500} />
              </BarChart>
            </ResponsiveContainer>
            {(() => {
              const h = data!.history; const last = h[h.length - 1];
              return (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-1" data-testid="text-today-activity">
                  <div className="rounded-md bg-secondary/60 p-3"><div className="text-xs text-muted-foreground">Open roles today</div><div className="tnum text-xl font-semibold">{last.total.toLocaleString()}</div></div>
                  <div className="rounded-md bg-secondary/60 p-3"><div className="text-xs text-muted-foreground">Added / removed today</div><div className="tnum text-xl font-semibold"><span className="text-primary">+{last.added}</span> <span className="text-muted-foreground">/ −{last.removed}</span></div></div>
                  <div className="col-span-2 text-[11px] text-muted-foreground md:col-span-1">Tracking since {h[0].date}</div>
                </div>
              );
            })()}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {intern ? (
          <Panel title="Internships by term" sub="A role can list more than one term">
            <HBar data={s.terms} height={420} color="hsl(var(--chart-1))" />
          </Panel>
        ) : (
        <Panel title="Most requested skills" sub="Number of postings mentioning each skill. Yours are highlighted.">
          <HBar data={s.skills} height={420} highlight={mySkills} />
        </Panel>)}
        <Panel title="Top hiring companies" sub="Open roles in scope">
          <HBar data={s.companies} height={420} color="hsl(var(--chart-2))" />
        </Panel>
        <Panel title="Roles by track">
          <HBar data={scope === "all" ? s.byCat : s.byCat.filter((c) => c.value > 0)} height={220} color="hsl(var(--chart-3))" />
        </Panel>
        {intern ? (
          <Panel title="By company size" sub="From public headcount ranges">
            <HBar data={s.sizes} height={220} color="hsl(var(--chart-4))" />
          </Panel>
        ) : (
        <Panel title="Median pay by track" sub="Midpoint of posted US ranges, base salary">
          {s.pay.length ? <HBar data={s.pay} height={220} color="hsl(var(--chart-4))" unit="$" /> : <p className="text-sm text-muted-foreground">Not enough posted ranges.</p>}
        </Panel>)}
        <Panel title="Work mode">
          <div className="grid grid-cols-3 gap-3">
            {s.modes.map((m) => (
              <div key={m.name} className="rounded-md bg-secondary/60 p-3">
                <div className="text-xs text-muted-foreground">{m.name}</div>
                <div className="tnum text-xl font-semibold">{base.length ? Math.round((m.value / base.length) * 100) : 0}%</div>
                <div className="tnum text-[11px] text-muted-foreground">{m.value} roles</div>
              </div>
            ))}
          </div>
          {!intern && <div className="mt-4 grid grid-cols-3 gap-3">
            {s.stages.map((m) => (
              <div key={m.name} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{m.name === "Late-stage" ? "Late-stage" : `${m.name} stage`}</div>
                <div className="tnum text-xl font-semibold">{m.value}</div>
              </div>
            ))}
          </div>}
        </Panel>
        <Panel title={intern ? "Best startup internship matches" : "Best early-stage matches"} sub={intern ? "Startups (≤500 people or on the curated AI list), ranked by your match score" : "Seed–Series B companies, ranked by your match score"}>
          <ul className="divide-y">
            {s.early.map((j) => (
              <li key={j.id} className="flex items-center gap-3 py-2">
                <span className="tnum w-8 text-sm font-semibold text-primary">{j.score}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{j.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{j.company} · {j.location}</div>
                </div>
                <a href={j.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline-offset-2 hover:underline" data-testid={`link-early-${j.id}`}>Apply</a>
              </li>
            ))}
            {s.early.length === 0 && <li className="py-2 text-sm text-muted-foreground">No {intern ? "startup internships" : "early-stage roles"} in scope.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
