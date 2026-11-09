import fs from "node:fs";
import type { Category, Job, Seniority, WorkMode, JobsResponse, DayStat } from "@shared/schema";
import { COMPANIES, type Company } from "./companies";
import { fetchSimplify, ensureSizes, enrich, simplifySlugs, termsFromText, parseHourly, hourlyText, WANTED_TERMS, internCategory } from "./internships";

const CACHE_FILE = "jobs-cache.json";
export const REFRESH_HOURS = 3;
const MAX_AGE_MS = REFRESH_HOURS * 60 * 60 * 1000;

interface Store {
  jobs: Job[];
  descriptions: Record<string, string>;
  syncedAt: string | null;
  companiesOk: number;
  failed: string[];
  history: DayStat[];
  internSource?: { ok: boolean; count: number; syncedAt: string | null };
}

let store: Store = { jobs: [], descriptions: {}, syncedAt: null, companiesOk: 0, failed: [], history: [] };
let syncing: Promise<void> | null = null;

// ---------- text helpers ----------
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", apos: "'", mdash: "—", ndash: "–", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: "…", bull: "•" };
function decodeEntities(s: string) {
  return s
    .replace(/&(amp|lt|gt|quot|#39|nbsp|apos|mdash|ndash|rsquo|lsquo|ldquo|rdquo|hellip|bull);/g, (_, e) => ENT[e])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
function htmlToText(html: string) {
  const h = decodeEntities(decodeEntities(html));
  return h
    .replace(/<\s*(br|\/p|\/div|\/h\d|\/li|\/ul|\/ol)\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

// ---------- classification ----------
const EXCLUDE =
  /\b(sales|account (executive|manager)|marketing|recruit|talent|counsel|legal|paralegal|people partner|hr\b|finance manager|accountant|controller|payroll|customer success|support (specialist|engineer)|gtm|go-to-market|business development|partnerships?|executive assistant|office|workplace|events|communications|copywriter|designer|brand|deal desk|procurement|tax|product manager|strategist|agent development manager|program manager|project manager|product lead|strategy|strategic|operations|support agent|solutions architect|solutions consultant|technical account|enablement|specialist|coordinator|analyst, (finance|revenue)|tutor|expert|contractor|annotator|trainer)\b/i;

const CAT_RULES: [Category, RegExp][] = [
  ["Research", /\b(research (scientist|engineer|lead|manager)|researcher|scientist, (pre|post)-?training|research,|\bresearch\b.*(model|ml|ai|rl|alignment|interpretability|training))/i],
  ["ML Infra & MLOps", /\b(ml ?ops|ml (infra|platform|systems)|ai (infra|infrastructure|platform)|inference|model serving|training (infra|platform|systems)|gpu|cuda|kernel|accelerat|distributed training|supercomput|compute (platform|infra))/i],
  ["Data Science", /\b(data scien|applied scien|decision scien|quantitative (analyst|researcher)|statistic|econometric|product analyst|data analyst|analytics (lead|manager)|insights)/i],
  ["Data Engineering", /\b(data engineer|analytics engineer|data platform|data infrastructure|data pipeline|etl|data warehouse)/i],
  ["AI / LLM Engineering", /\b(ai engineer|llm|applied ai|ai (product|agent|solutions|application)s? engineer|forward deployed|agent|agentic|genai|generative ai|prompt|evals?\b|evaluation|post-training|fine-tun|rlhf|reinforcement learning|ai\b.*engineer|engineer.*\bai\b)/i],
  ["ML Engineering", /\b(machine learning|\bml\b|deep learning|computer vision|\bnlp\b|natural language|perception|recommend|ranking|personalization|search relevance|speech|audio ml|modeling|model (training|quality)|pre-?training|robot learning|autonomy)/i],
];

function classify(title: string, dept: string): Category | null {
  if (EXCLUDE.test(title)) return null;
  if (/\b(marketing|sales|go[- ]to[- ]market|gtm|revenue|business)\b/i.test(dept)) return null;
  const t = title;
  // Generic "Member of Technical Staff" only counts when it names an ML area
  for (const [cat, re] of CAT_RULES) if (re.test(t)) return cat;
  // fall back on department signal for ambiguous engineering titles
  if (/\b(engineer|scientist|technical staff)\b/i.test(t)) {
    if (/\b(frontend|front-end|ios|android|mobile|web|full[- ]?stack|product engineer|design engineer|security|it\b)/i.test(t)) return null;
    if (/\bresearch\b/i.test(dept) && /scientist|research|model/i.test(t)) return "Research";
    if (/\b(machine learning|ml)\b/i.test(dept)) return "ML Engineering";
    if (/\bdata science\b/i.test(dept)) return "Data Science";
  }
  return null;
}

function seniorityOf(title: string): Seniority {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b|\bco-?op\b/.test(t)) return "Intern";
  if (/\b(head of|director|vp|vice president|manager|chief)\b/.test(t) && !/\bproduct manager\b/.test(t)) return "Manager";
  const tt = t.replace(/members? of (the )?technical staff/g, "");
  if (/\b(staff|principal|distinguished|lead|architect|fellow)\b/.test(tt)) return "Staff+";
  if (/\b(senior|sr\.?)\b/.test(tt)) return "Senior";
  if (/\b(new grad|junior|jr\.?|entry|early career|associate|graduate|residen(t|cy)|fellowship|i\b(?!i))/.test(t)) return "Entry";
  return "Mid";
}

const SKILLS: [string, RegExp][] = [
  ["Python", /\bpython\b/i],
  ["PyTorch", /\bpytorch\b|\btorch\b/i],
  ["JAX", /\bjax\b/i],
  ["TensorFlow", /\btensorflow\b/i],
  ["CUDA", /\bcuda\b/i],
  ["Triton", /\btriton\b/i],
  ["C++", /\bc\+\+/i],
  ["Rust", /\brust\b/i],
  ["Go", /\bgolang\b|\bgo\b(?= |,)(?=.*\b(services|backend|language)\b)/i],
  ["TypeScript", /\btypescript\b/i],
  ["SQL", /\bsql\b/i],
  ["Spark", /\bspark\b|\bpyspark\b/i],
  ["dbt", /\bdbt\b/i],
  ["Snowflake", /\bsnowflake\b/i],
  ["Airflow", /\bairflow\b/i],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["Ray", /\bray\b(?= |,|\.)(?=[^.]{0,80}\b(distributed|cluster|serve|train|data)\b)/i],
  ["AWS", /\baws\b|amazon web services/i],
  ["GCP", /\bgcp\b|google cloud/i],
  ["LLMs", /\bllms?\b|large language model/i],
  ["RAG", /\brag\b|retrieval[- ]augmented/i],
  ["Agents", /agentic|multi-agent|agent (framework|infrastructure|workflow|harness|platform)s?|tool[- ]use|building (ai )?agents/i],
  ["Evals", /\bevals?\b|evaluation (framework|harness|pipeline)s?/i],
  ["RLHF / RL", /\brlhf\b|reinforcement learning|\brl\b/i],
  ["Fine-tuning", /fine-?tun/i],
  ["Distributed training", /distributed training|multi-node|data parallel|model parallel|fsdp|deepspeed|megatron/i],
  ["Inference optimization", /inference (optimization|performance|efficiency)|vllm|tensorrt|sglang|quantization/i],
  ["Computer vision", /computer vision|vision[- ]language|image (model|generation|understanding)|video (model|generation|understanding)|multimodal/i],
  ["Speech / audio", /\bspeech\b|\baudio\b|\btts\b|\basr\b/i],
  ["NLP", /\bnlp\b|natural language/i],
  ["Recommenders", /recommend(er|ation)s?|ranking|personaliz/i],
  ["Experimentation", /a\/b test|experimentation|causal inference/i],
  ["Statistics", /\bstatistic(s|al)\b|bayesian|probabilit/i],
  ["Embeddings / vector search", /embeddings?|vector (search|database)/i],
];

function extractSkills(text: string): string[] {
  const out: string[] = [];
  for (const [name, re] of SKILLS) if (re.test(text)) out.push(name);
  return out;
}

const SAL_RE =
  /\$\s?(\d{2,3}(?:,\d{3})+(?:\.\d+)?|\d{2,3}(?:\.\d+)?\s?[kK])\s*(?:USD)?\s*(?:-|–|—|to)\s*(?:USD\s*)?\$?\s?(\d{2,3}(?:,\d{3})+(?:\.\d+)?|\d{2,3}(?:\.\d+)?\s?[kK])/;
function toK(s: string): number {
  const c = s.replace(/[\s,$]/g, "");
  if (/k$/i.test(c)) return Math.round(parseFloat(c));
  return Math.round(parseFloat(c) / 1000);
}
function parseSalary(text: string | undefined | null): { min: number; max: number; text: string } | null {
  if (!text) return null;
  const m = text.match(SAL_RE);
  if (!m) return null;
  const min = toK(m[1]);
  const max = toK(m[2]);
  if (!(min >= 40 && max >= min && max <= 2000)) return null;
  return { min, max, text: `$${min}K – $${max}K` };
}

const US_RE =
  /\b(united states|usa|u\.s\.|\bus\b|remote[- ,(]*us|san francisco|sf\b|new york|nyc|seattle|boston|austin|chicago|los angeles|palo alto|mountain view|menlo park|redwood city|san mateo|san jose|sunnyvale|denver|atlanta|washington|dc\b|virginia|arlington|miami|bay area|california|\bca\b|\bny\b|\bwa\b|\btx\b|\bma\b|\bco\b|\bva\b|pittsburgh|philadelphia|south san francisco|san diego|portland|salt lake|raleigh|dallas|houston)\b/i;

const NON_US_RE =
  /\b(korea|seoul|japan|tokyo|singapore|india|bangalore|bengaluru|hyderabad|london|uk|united kingdom|england|germany|berlin|munich|paris|france|canada|toronto|montreal|vancouver|europe|emea|apac|australia|sydney|melbourne|brazil|s[aã]o paulo|latam|mexico|spain|madrid|barcelona|netherlands|amsterdam|dublin|ireland|zurich|switzerland|poland|warsaw|israel|tel aviv|china|beijing|shanghai|taiwan|hong kong|italy|milan|sweden|stockholm|denmark|copenhagen|portugal|lisbon|uae|dubai|argentina|colombia|chile|belgium|austria|finland|norway|czech|romania|ukraine|serbia|turkey|philippines|indonesia|vietnam|thailand|malaysia|new zealand|south africa|nigeria|kenya|egypt)\b/i;

function workModeOf(loc: string, ashbyType?: string | null): WorkMode {
  if (ashbyType === "Remote") return "Remote";
  if (/\bremote\b/i.test(loc)) return "Remote";
  if (ashbyType === "Hybrid" || /\bhybrid\b/i.test(loc)) return "Hybrid";
  return "Onsite";
}

// ---------- fetching ----------
async function getJSON(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "ml-job-board/1.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function makeJob(c: Company, raw: {
  id: string; title: string; dept: string; location: string; ashbyType?: string | null;
  postedAt: string | null; url: string; desc: string; salary: ReturnType<typeof parseSalary>; payText?: string | null;
}): Job | null {
  const seniority = seniorityOf(raw.title);
  const intern = seniority === "Intern";
  const category = classify(raw.title, raw.dept) ?? (intern && /\b(ml|ai|machine learning|data|research)\b/i.test(raw.title + " " + raw.dept) ? internCategory(raw.title) : null);
  if (!category) return null;
  const loc = raw.location || "Unspecified";
  if (intern && (/\b(design|banking|mba|quality assurance)\b/i.test(raw.title) || (!US_RE.test(loc) && (NON_US_RE.test(loc) || !/remote/i.test(loc))))) return null;
  const terms = intern ? termsFromText(raw.title + "\n" + raw.desc.slice(0, 4000)).filter((t) => WANTED_TERMS.includes(t)) : [];
  const hourly = intern ? parseHourly(raw.payText ?? "") ?? parseHourly(raw.desc) : null;
  if (intern) raw.salary = null;
  return {
    kind: intern ? "internship" : "fulltime",
    companyType: "Startup",
    companySize: null,
    terms,
    payHourlyMin: hourly?.min ?? null,
    payHourlyMax: hourly?.max ?? null,
    checkedAt: new Date().toISOString(),
    degrees: [],
    sponsorship: null,
    id: `${c.ats === "ashby" ? "a" : "g"}-${c.slug}-${raw.id}`,
    title: raw.title.trim(),
    company: c.name,
    companySlug: c.slug,
    sector: c.sector,
    stage: c.stage,
    category,
    seniority,
    location: loc,
    workMode: workModeOf(loc, raw.ashbyType),
    usBased: US_RE.test(loc),
    intlOnly: !US_RE.test(loc) && NON_US_RE.test(loc),
    salaryMinK: raw.salary?.min ?? null,
    salaryMaxK: raw.salary?.max ?? null,
    salaryText: intern ? hourlyText(hourly) : raw.salary?.text ?? null,
    postedAt: raw.postedAt,
    firstSeenAt: "",
    skills: extractSkills(raw.title + "\n" + raw.desc),
    url: raw.url,
    source: c.ats === "ashby" ? "Ashby" : "Greenhouse",
    department: raw.dept,
  };
}

async function fetchCompany(c: Company): Promise<{ jobs: Job[]; desc: Record<string, string> }> {
  const jobs: Job[] = [];
  const desc: Record<string, string> = {};
  if (c.ats === "ashby") {
    const d = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${c.slug}?includeCompensation=true`);
    for (const j of d.jobs ?? []) {
      if (j.isListed === false) continue;
      const locs = [j.location, ...(j.secondaryLocations ?? []).map((s: any) => s.location)].filter(Boolean);
      const location = locs.slice(0, 3).join(" · ") + (locs.length > 3 ? ` +${locs.length - 3}` : "");
      const text = j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? "");
      const salary =
        parseSalary(j.compensation?.scrapeableCompensationSalarySummary) ??
        parseSalary(j.compensation?.compensationTierSummary) ??
        parseSalary(text);
      const job = makeJob(c, {
        id: j.id, title: j.title, dept: [j.department, j.team].filter(Boolean).join(" / "),
        location, ashbyType: j.workplaceType, postedAt: j.publishedAt ?? null, url: j.jobUrl, desc: text, salary,
        payText: [j.compensation?.scrapeableCompensationSalarySummary, j.compensation?.compensationTierSummary].filter(Boolean).join(" "),
      });
      if (job) { jobs.push(job); desc[job.id] = text.slice(0, 9000); }
    }
  } else {
    const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`);
    for (const j of d.jobs ?? []) {
      const text = htmlToText(j.content ?? "");
      const job = makeJob(c, {
        id: String(j.id), title: j.title, dept: (j.departments ?? []).map((x: any) => x.name).join(" / "),
        location: j.location?.name ?? "", postedAt: j.first_published ?? j.updated_at ?? null,
        url: j.absolute_url, desc: text, salary: parseSalary(text),
      });
      if (job) { jobs.push(job); desc[job.id] = text.slice(0, 9000); }
    }
  }
  return { jobs, desc };
}

async function syncAll() {
  const results: { jobs: Job[]; desc: Record<string, string> }[] = [];
  const failed: string[] = [];
  let ok = 0;
  const queue = [...COMPANIES];
  async function worker() {
    while (queue.length) {
      const c = queue.shift()!;
      try {
        results.push(await fetchCompany(c));
        ok++;
      } catch (e) {
        failed.push(c.name);
        // keep previously cached jobs for this company
        const prev = store.jobs.filter((j) => j.companySlug === c.slug);
        const pd: Record<string, string> = {};
        prev.forEach((j) => (pd[j.id] = store.descriptions[j.id] ?? ""));
        results.push({ jobs: prev, desc: pd });
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  // Internship list (Simplify). On failure keep the previous internship snapshot.
  let interns: Job[] = [];
  let internSource = store.internSource ?? { ok: false, count: 0, syncedAt: null };
  try {
    interns = await fetchSimplify();
    internSource = { ok: true, count: interns.length, syncedAt: new Date().toISOString() };
  } catch (e) {
    console.log(`[interns] list fetch failed: ${(e as Error).message}`);
    interns = store.jobs.filter((j) => j.source === "Simplify");
    internSource = { ...internSource, ok: false };
  }
  // Drop list entries that duplicate a posting we already read directly from a startup's own board
  const direct = results.flatMap((r) => r.jobs);
  const key = (j: Job) => `${j.company.toLowerCase().replace(/\W/g, "")}|${j.title.toLowerCase().replace(/\W/g, "")}`;
  const directKeys = new Set(direct.map(key));
  interns = interns.filter((j) => !directKeys.has(key(j)));
  const jobs = [...direct, ...interns];
  const seen = new Set<string>();
  const unique = jobs.filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)));
  // carry forward first-seen timestamps so "added today" is meaningful
  const now = new Date().toISOString();
  const hadInterns = store.jobs.some((j) => j.source === "Simplify");
  const baselineAll = store.jobs.length === 0;
  const prevSeen = new Map(store.jobs.map((j) => [j.id, j.firstSeenAt]));
  let added = 0;
  for (const j of unique) {
    const prev = prevSeen.get(j.id);
    if (prev) j.firstSeenAt = prev;
    else if (baselineAll || (j.source === "Simplify" && !hadInterns)) j.firstSeenAt = j.postedAt && !isNaN(Date.parse(j.postedAt)) ? new Date(j.postedAt).toISOString() : now;
    else if (j.postedAt && Date.now() - Date.parse(j.postedAt) > 14 * 86400000) j.firstSeenAt = new Date(j.postedAt).toISOString(); // old posting newly matched by a rule change
    else { j.firstSeenAt = now; added++; }
  }
  const currentIds = new Set(unique.map((j) => j.id));
  const removed = baselineAll ? 0 : store.jobs.filter((j) => !currentIds.has(j.id)).length;
  const day = now.slice(0, 10);
  const history = [...(store.history ?? [])];
  const last = history[history.length - 1];
  if (last && last.date === day) {
    last.total = unique.length; last.added += added; last.removed += removed; last.syncs++;
  } else history.push({ date: day, total: unique.length, added, removed, syncs: 1 });
  store = {
    history: history.slice(-60),
    jobs: unique,
    descriptions: Object.assign({}, ...results.map((r) => r.desc)),
    syncedAt: new Date().toISOString(),
    companiesOk: ok,
    failed,
    internSource,
  };
  for (const j of store.jobs) enrich(j);
  ensureSizes(simplifySlugs(store.jobs), () => { for (const j of store.jobs) enrich(j); try { fs.writeFileSync(CACHE_FILE, JSON.stringify(store)); } catch {} });
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(store)); } catch {}
  console.log(`[jobs] synced ${unique.length} roles from ${ok}/${COMPANIES.length} companies`);
}

// Manual refresh from the UI: ignore if the last sync finished under 10 min ago.
export function requestRefresh(): boolean {
  const age = store.syncedAt ? Date.now() - new Date(store.syncedAt).getTime() : Infinity;
  if (syncing || age < 10 * 60 * 1000) return false;
  triggerSync();
  return true;
}

export function triggerSync(): Promise<void> {
  if (!syncing) syncing = syncAll().finally(() => { syncing = null; });
  return syncing;
}

export function initJobs() {
  try {
    if (fs.existsSync(CACHE_FILE)) store = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {}
  if (!store.history) store.history = [];
  store.jobs.forEach((j) => { if (!j.firstSeenAt) j.firstSeenAt = j.postedAt ?? new Date().toISOString(); });
  store.jobs.forEach((j) => enrich(j));
  // one-time repair: postings that were already weeks old when first picked up shouldn't read as "added today"
  store.jobs.forEach((j) => {
    if (j.postedAt && Date.parse(j.firstSeenAt) - Date.parse(j.postedAt) > 14 * 86400000 && Date.now() - Date.parse(j.firstSeenAt) < 3 * 86400000) j.firstSeenAt = new Date(j.postedAt).toISOString();
  });
  ensureSizes(simplifySlugs(store.jobs), () => store.jobs.forEach((j) => enrich(j)));
  syncIfStale();
  // while the server is awake, re-check every 15 minutes
  setInterval(() => syncIfStale(), 15 * 60 * 1000).unref();
}

export function getJobs(): JobsResponse {
  return {
    jobs: store.jobs,
    syncedAt: store.syncedAt,
    syncing: !!syncing,
    companiesOk: store.companiesOk,
    companiesTotal: COMPANIES.length,
    failed: store.failed,
    history: store.history ?? [],
    refreshHours: REFRESH_HOURS,
    internSource: store.internSource ?? { ok: false, count: 0, syncedAt: null },
  };
}

// Called on every read: if the snapshot is stale (e.g. the server was paused
// overnight), start a background sync so the board catches up on open.
export function syncIfStale() {
  const age = store.syncedAt ? Date.now() - new Date(store.syncedAt).getTime() : Infinity;
  if (age > MAX_AGE_MS) triggerSync();
}

export function getDescription(id: string): string | null {
  return store.descriptions[id] ?? null;
}

export async function waitForSync() {
  if (syncing) await syncing;
}
