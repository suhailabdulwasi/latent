import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useProfile, useSaveProfile } from "@/hooks/use-data";
import { CATEGORIES, SENIORITIES, STAGES, DEFAULT_PROFILE, INTERN_TERMS, COMPANY_TYPES, COMPANY_TYPE_LABEL, type Profile } from "@shared/schema";
import { cn } from "@/lib/utils";

const SKILL_OPTIONS = [
  "Python", "PyTorch", "JAX", "TensorFlow", "CUDA", "Triton", "C++", "Rust", "Go", "TypeScript", "SQL", "Spark", "dbt", "Snowflake",
  "Airflow", "Kubernetes", "Ray", "AWS", "GCP", "LLMs", "RAG", "Agents", "Evals", "RLHF / RL", "Fine-tuning", "Distributed training",
  "Inference optimization", "Computer vision", "Speech / audio", "NLP", "Recommenders", "Experimentation", "Statistics", "Embeddings / vector search",
];

function Toggle({ on, onClick, children, testid }: { on: boolean; onClick: () => void; children: React.ReactNode; testid: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testid}
      className={cn("rounded-md border px-3 py-1.5 text-sm transition-colors", on ? "border-primary/50 bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-b py-5 last:border-0 md:grid-cols-[220px_1fr]">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { profile, isLoading } = useProfile();
  const save = useSaveProfile();
  const { toast } = useToast();
  const [p, setP] = useState<Profile>(profile);
  const [loc, setLoc] = useState("");
  const [city, setCity] = useState("");
  useEffect(() => { if (!isLoading) setP(profile); }, [isLoading, profile]);

  const toggle = (key: "categories" | "seniorities" | "skills" | "stages" | "terms" | "companyTypes", v: string) =>
    setP((x) => ({ ...x, [key]: x[key].includes(v) ? x[key].filter((y) => y !== v) : [...x[key], v] }));
  const dirty = JSON.stringify(p) !== JSON.stringify(profile);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Match profile</h1>
          <p className="text-sm text-muted-foreground">Every role on the board is scored 0–100 against this.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setP(DEFAULT_PROFILE)} data-testid="button-reset">Reset</Button>
          <Button size="sm" disabled={!dirty || save.isPending} data-testid="button-save-profile"
            onClick={() => save.mutate(p, { onSuccess: () => toast({ title: "Profile saved", description: "Match scores updated." }) })}>
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </div>

      <h2 className="mt-4 text-sm font-medium text-muted-foreground">Internships</h2>
      <div className="rounded-lg border bg-card px-5">
        <Field label="Terms" hint="Summer counts anywhere in the US. Fall, Winter and Spring only count when remote or in a school city below (30 pts).">
          <div className="flex flex-wrap gap-2">{INTERN_TERMS.map((c) => <Toggle key={c} on={p.terms.includes(c)} onClick={() => toggle("terms", c)} testid={`toggle-term-${c.replace(/\W+/g, "-")}`}>{c}</Toggle>)}</div>
        </Field>
        <Field label="School-term cities" hint="On-site Fall/Winter/Spring roles are OK here (e.g. near campus)">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {p.schoolCities.map((l) => (
                <span key={l} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">{l}
                  <button aria-label={`Remove ${l}`} onClick={() => setP({ ...p, schoolCities: p.schoolCities.filter((x) => x !== l) })} data-testid={`button-remove-city-${l}`}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                </span>
              ))}
            </div>
            <form className="flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); const v = city.trim(); if (v && !p.schoolCities.includes(v)) setP({ ...p, schoolCities: [...p.schoolCities, v] }); setCity(""); }}>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Add a city, e.g. Richmond" className="h-9" data-testid="input-city" />
              <Button type="submit" variant="outline" size="sm" className="h-9" data-testid="button-add-city"><Plus className="h-4 w-4" />Add</Button>
            </form>
          </div>
        </Field>
        <Field label="Company sizes" hint="The board shows these by default (20 pts). Startup = ≤500 people or on the curated AI-startup list.">
          <div className="flex flex-wrap gap-2">{COMPANY_TYPES.map((c) => <Toggle key={c} on={p.companyTypes.includes(c)} onClick={() => toggle("companyTypes", c)} testid={`toggle-size-${c}`}>{COMPANY_TYPE_LABEL[c]}</Toggle>)}</div>
        </Field>
        <Field label="Hourly pay floor" hint="Internships whose posted max is below this lose 10 pts. 0 to ignore.">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-sm text-muted-foreground">$</span>
            <Input type="number" min={0} max={300} step={1} value={p.minHourly} className="tnum h-9 w-24"
              onChange={(e) => setP({ ...p, minHourly: Math.max(0, Math.min(300, Number(e.target.value) || 0)) })} data-testid="input-hourly" />
            <span className="text-sm text-muted-foreground">/ hr</span>
          </div>
        </Field>
      </div>

      <h2 className="mt-4 text-sm font-medium text-muted-foreground">All roles</h2>
      <div className="rounded-lg border bg-card px-5">
        <Field label="Target roles" hint="30 pts when a role is in one of these tracks">
          <div className="flex flex-wrap gap-2">{CATEGORIES.map((c) => <Toggle key={c} on={p.categories.includes(c)} onClick={() => toggle("categories", c)} testid={`toggle-cat-${c.replace(/\W+/g, "-")}`}>{c}</Toggle>)}</div>
        </Field>
        <Field label="Level (full-time)" hint="20 pts for an exact level, 10 for one step off">
          <div className="flex flex-wrap gap-2">{SENIORITIES.map((c) => <Toggle key={c} on={p.seniorities.includes(c)} onClick={() => toggle("seniorities", c)} testid={`toggle-level-${c}`}>{c}</Toggle>)}</div>
        </Field>
        <Field label="Your skills" hint="Up to 30 pts for overlap with skills the posting mentions">
          <div className="flex flex-wrap gap-1.5">{SKILL_OPTIONS.map((c) => <Toggle key={c} on={p.skills.includes(c)} onClick={() => toggle("skills", c)} testid={`toggle-skill-${c.replace(/\W+/g, "-")}`}>{c}</Toggle>)}</div>
        </Field>
        <Field label="Preferred areas" hint="Remote or one of these: 20 pts full-time, 15 pts internships">
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={p.remoteOk} onCheckedChange={(v) => setP({ ...p, remoteOk: v })} data-testid="switch-remote" />Open to remote</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={p.openToRelocate} onCheckedChange={(v) => setP({ ...p, openToRelocate: v })} data-testid="switch-relocate" />Open to relocating within the US</label>
            <div className="flex flex-wrap gap-1.5">
              {p.locations.map((l) => (
                <span key={l} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                  {l}
                  <button aria-label={`Remove ${l}`} onClick={() => setP({ ...p, locations: p.locations.filter((x) => x !== l) })} data-testid={`button-remove-loc-${l}`}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                </span>
              ))}
            </div>
            <form className="flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); const v = loc.trim(); if (v && !p.locations.includes(v)) setP({ ...p, locations: [...p.locations, v] }); setLoc(""); }}>
              <Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Add a city, e.g. Austin" className="h-9" data-testid="input-location" />
              <Button type="submit" variant="outline" size="sm" className="h-9" data-testid="button-add-location"><Plus className="h-4 w-4" />Add</Button>
            </form>
          </div>
        </Field>
        <Field label="Salary floor (full-time)" hint="Roles whose posted max is below this lose 20 pts. 0 to ignore.">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-sm text-muted-foreground">$</span>
            <Input type="number" min={0} max={2000} step={10} value={p.minSalaryK} className="tnum h-9 w-28"
              onChange={(e) => setP({ ...p, minSalaryK: Math.max(0, Math.min(2000, Number(e.target.value) || 0)) })} data-testid="input-salary" />
            <span className="text-sm text-muted-foreground">K / yr</span>
          </div>
        </Field>
        <Field label="Company stage (full-time)" hint="Roles at stages you don't pick lose 15 pts">
          <div className="flex flex-wrap gap-2">{STAGES.map((c) => <Toggle key={c} on={p.stages.includes(c)} onClick={() => toggle("stages", c)} testid={`toggle-stage-${c}`}>{c === "Early" ? "Early (Seed–B)" : c === "Growth" ? "Growth (C+)" : "Late-stage"}</Toggle>)}</div>
        </Field>
      </div>
    </div>
  );
}
