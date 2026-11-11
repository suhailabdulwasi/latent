// Internship ingestion: the community-maintained SimplifyJobs Summer 2027
// list (which also tracks off-cycle Fall/Winter/Spring terms), enriched with
// company headcount from each company's public Simplify page so we can tell
// startups from large companies.
import fs from "node:fs";
import type { Category, CompanyType, Job } from "@shared/schema";
import { COMPANIES } from "./companies";

const LIST_URL = "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json";
const SIZE_FILE = "company-sizes.json";
export const WANTED_TERMS = ["Summer 2027", "Fall 2027", "Winter 2027", "Spring 2027"];
const MAX_POST_AGE_DAYS = 240;

// ---- helpers shared with the full-time pipeline ----
const ML_TITLE = /\b(machine learning|\bml\b|\bai\b|a\.i\.|artificial intelligence|data scien|data analy|analytics|llm|genai|generative|deep learning|computer vision|\bnlp\b|natural language|data engineer|research scien|applied scien|quantitative research|statistic|robot learning|perception|reinforcement|recommend)/i;
const EXCLUDE = /\b(sales|marketing|recruit|talent|legal|accounting|payroll|customer success|business development|hr\b|human resources|supply chain|procurement|tax\b|audit)\b/i;

export function internCategory(title: string): Category {
  const t = title;
  if (/\b(research (scientist|engineer|intern)|researcher|phd|ai research|ml research)\b/i.test(t)) return "Research";
  if (/\b(ml ?ops|ml (infra|platform|systems)|ai (infra|infrastructure|platform)|inference|gpu|cuda|kernel|compiler|distributed)\b/i.test(t)) return "ML Infra & MLOps";
  if (/\b(data engineer|analytics engineer|data platform|data infrastructure|etl|data pipeline)\b/i.test(t)) return "Data Engineering";
  if (/\b(data scien|data analy|analytics|statistic|decision scien|quantitative|insights|business intelligence|econometric)\b/i.test(t)) return "Data Science";
  if (/\b(llm|genai|generative|agent|ai engineer|applied ai|ai software|ai\/ml|ai &|\bai\b)/i.test(t)) return "AI / LLM Engineering";
  return "ML Engineering";
}

const TERM_RE = /\b(summer|fall|autumn|winter|spring)\s*(?:of\s*)?'?(20)?(2[6-8])\b/gi;
export function termsFromText(text: string): string[] {
  const out = new Set<string>();
  for (const m of Array.from(text.matchAll(TERM_RE))) {
    const season = m[1].toLowerCase() === "autumn" ? "Fall" : m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    out.add(`${season} 20${m[3]}`);
  }
  return Array.from(out);
}

// Hourly pay ("$25 - $35 per hour", "$40/hr", "$7,000/month")
const HR_RANGE = /\$\s?(\d{2,3}(?:\.\d{1,2})?)\s*(?:\/\s*h(?:ou)?r)?\s*(?:-|–|—|to)\s*\$?\s?(\d{2,3}(?:\.\d{1,2})?)\s*(?:usd\s*)?(?:\/|per|an|a)\s*h(?:ou)?r/i;
const HR_SINGLE = /\$\s?(\d{2,3}(?:\.\d{1,2})?)\s*(?:usd\s*)?(?:\/|per|an|a)\s*h(?:ou)?r/i;
const MO_RANGE = /\$\s?(\d{1,2},?\d{3})\s*(?:-|–|—|to)\s*\$?\s?(\d{1,2},?\d{3})\s*(?:usd\s*)?(?:\/|per|a)\s*mo(?:nth)?/i;
const MO_SINGLE = /\$\s?(\d{1,2},?\d{3})\s*(?:usd\s*)?(?:\/|per|a)\s*mo(?:nth)?/i;
const YR_RANGE = /\$\s?(\d{2,3}),?(\d{3})\s*(?:usd\s*)?(?:-|–|—|to)\s*\$?\s?(\d{2,3}),?(\d{3})/;
export function parseHourly(text: string | null | undefined): { min: number; max: number } | null {
  if (!text) return null;
  let m = text.match(HR_RANGE);
  if (m) { const a = +m[1], b = +m[2]; if (a >= 12 && b >= a && b <= 200) return { min: Math.round(a), max: Math.round(b) }; }
  m = text.match(HR_SINGLE);
  if (m) { const a = +m[1]; if (a >= 12 && a <= 200) return { min: Math.round(a), max: Math.round(a) }; }
  const mo = (s: string) => Math.round((+s.replace(",", "") * 12) / 2080);
  m = text.match(MO_RANGE);
  if (m) { const a = mo(m[1]), b = mo(m[2]); if (a >= 12 && b >= a && b <= 200) return { min: a, max: b }; }
  m = text.match(MO_SINGLE);
  if (m) { const a = mo(m[1]); if (a >= 12 && a <= 200) return { min: a, max: a }; }
  // Annualized intern pay ("$104,000 – $130,000") → hourly at 2080h/yr
  m = text.match(YR_RANGE);
  if (m) {
    const a = Math.round(+(m[1] + m[2]) / 2080), b = Math.round(+(m[3] + m[4]) / 2080);
    if (a >= 15 && b >= a && b <= 150) return { min: a, max: b };
  }
  return null;
}
export function hourlyText(p: { min: number; max: number } | null) {
  if (!p) return null;
  return p.min === p.max ? `$${p.min}/hr` : `$${p.min}–$${p.max}/hr`;
}

const US_STATE = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i;
const US_WORD = /\b(usa|united states|u\.s\.|remote in usa|\bsf\b|nyc|new york|san francisco|seattle|boston|chicago|austin|bay area|los angeles|washington)\b/i;
const NON_US = /\b(uk|canada|ontario|toronto|london|india|germany|france|ireland|singapore|japan|china|mexico|israel|netherlands|poland|spain|australia|switzerland|brazil|taiwan|korea|vancouver, bc|montreal|quebec)\b/i;
export function isUSLoc(l: string) { return US_STATE.test(l) || US_WORD.test(l) || /^remote$/i.test(l.trim()); }
export function isNonUSLoc(l: string) { return NON_US.test(l) && !US_STATE.test(l); }

// ---- company size cache ----
interface SizeEntry { size: string | null; at: number }
let sizes: Record<string, SizeEntry> = {};
try { if (fs.existsSync(SIZE_FILE)) sizes = JSON.parse(fs.readFileSync(SIZE_FILE, "utf8")); } catch {}
let sizeWorkerRunning = false;

function slugFromUrl(u: string) { return (u.split("/c/")[1] ?? "").split(/[?#/]/)[0]; }

async function fetchSize(slug: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`https://simplify.jobs/c/${slug}`, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (internship-board)" } });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/companySize=([^&"]+)/);
    if (!m) return null;
    return decodeURIComponent(m[1]).replace(/\+/g, " ").replace(/\s+employees/, " employees").trim();
  } catch { return null; } finally { clearTimeout(t); }
}

/** Background: fill in headcount for companies we haven't looked up (or looked up > 30 days ago). */
export function ensureSizes(slugs: string[], onDone?: () => void) {
  if (sizeWorkerRunning) return;
  const stale = 30 * 86400000;
  const todo = Array.from(new Set(slugs)).filter((s) => s && (!sizes[s] || Date.now() - sizes[s].at > stale));
  if (!todo.length) return;
  sizeWorkerRunning = true;
  (async () => {
    let n = 0;
    async function worker() {
      while (todo.length) {
        const s = todo.shift()!;
        sizes[s] = { size: await fetchSize(s), at: Date.now() };
        if (++n % 25 === 0) { try { fs.writeFileSync(SIZE_FILE, JSON.stringify(sizes)); } catch {} onDone?.(); }
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    try { fs.writeFileSync(SIZE_FILE, JSON.stringify(sizes)); } catch {}
    console.log(`[interns] company sizes cached: ${Object.keys(sizes).length}`);
    sizeWorkerRunning = false;
    onDone?.();
  })();
}

export function sizeTypeOf(size: string | null): CompanyType {
  if (!size) return "Unknown";
  const lo = parseInt(size.replace(/,/g, ""), 10);
  if (isNaN(lo)) return "Unknown";
  if (lo <= 201) return "Startup";      // 1–10, 11–50, 51–200, 201–500
  if (lo <= 501) return "Small";        // 501–1,000
  if (lo <= 1001) return "Mid-size";    // 1,001–5,000
  return "Large";                       // 5,001+
}

const curated = new Map(COMPANIES.map((c) => [c.name.toLowerCase(), c]));
export function enrich(j: Job) {
  const slug = j.simplifySlug;
  const sz = slug ? sizes[slug]?.size ?? null : null;
  const cur = curated.get(j.company.toLowerCase());
  j.companySize = sz;
  if (cur) { j.companyType = "Startup"; j.stage = j.stage ?? cur.stage; j.sector = cur.sector; }
  else j.companyType = sizeTypeOf(sz);
}

// ---- listing ingestion ----
function cleanLoc(l: string) { return l.replace(/\s+/g, " ").trim(); }

export async function fetchSimplify(): Promise<Job[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000);
  let raw: any[];
  try {
    const r = await fetch(LIST_URL, { signal: ctrl.signal, headers: { "User-Agent": "internship-board/1.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    raw = await r.json();
  } finally { clearTimeout(t); }
  const cutoff = Date.now() / 1000 - MAX_POST_AGE_DAYS * 86400;
  const out: Job[] = [];
  const byKey = new Map<string, Job>();
  for (const x of raw) {
    if (!x.active || !x.is_visible) continue;
    const title: string = String(x.title ?? "").trim();
    const cat: string = x.category ?? "";
    const mlCat = cat === "AI/ML/Data" || /data science|machine learning/i.test(cat);
    if (!mlCat && !ML_TITLE.test(title)) continue;
    if (EXCLUDE.test(title)) continue;
    let terms: string[] = (x.terms ?? []).filter((t: string) => WANTED_TERMS.includes(t));
    if (!terms.length && (x.terms ?? []).includes("N/A")) terms = termsFromText(title).filter((t) => WANTED_TERMS.includes(t));
    if (!terms.length) continue;
    if ((x.date_posted ?? 0) < cutoff) continue;
    const locs: string[] = (x.locations ?? []).map(cleanLoc).filter(Boolean);
    const anyUS = locs.length === 0 || locs.some(isUSLoc);
    const remote = locs.some((l) => /remote/i.test(l)) || /\bremote\b/i.test(title);
    const intlOnly = !anyUS && locs.some(isNonUSLoc);
    if (intlOnly) continue; // US-only board
    const location = locs.length ? locs.join(" · ") : "Location not listed";
    const posted = new Date((x.date_posted ?? 0) * 1000).toISOString();
    const checked = new Date((x.date_updated ?? x.date_posted ?? 0) * 1000).toISOString();
    const pay = parseHourly(title);
    const key = `${String(x.company_name ?? "").toLowerCase().replace(/\W/g, "")}|${title.toLowerCase().replace(/\W/g, "")}|${location.toLowerCase()}`;
    const dup = byKey.get(key);
    if (dup) {
      // same posting listed twice: merge terms, keep the most recently confirmed one's dates
      dup.terms = Array.from(new Set([...dup.terms, ...terms]));
      if (Date.parse(checked) > Date.parse(dup.checkedAt ?? "")) dup.checkedAt = checked;
      continue;
    }
    const job: Job = {
      id: `s-${x.id}`,
      kind: "internship",
      title,
      company: String(x.company_name ?? "").trim(),
      companySlug: slugFromUrl(x.company_url ?? ""),
      simplifySlug: slugFromUrl(x.company_url ?? ""),
      sector: "",
      stage: null,
      companyType: "Unknown",
      companySize: null,
      category: internCategory(title),
      seniority: "Intern",
      location,
      workMode: remote ? "Remote" : /hybrid/i.test(location) ? "Hybrid" : "Onsite",
      usBased: anyUS,
      intlOnly: false,
      salaryMinK: null, salaryMaxK: null,
      salaryText: hourlyText(pay),
      payHourlyMin: pay?.min ?? null, payHourlyMax: pay?.max ?? null,
      postedAt: posted,
      checkedAt: checked,
      firstSeenAt: "",
      terms,
      skills: [],
      degrees: Array.isArray(x.degrees) ? x.degrees : [],
      sponsorship: x.sponsorship && x.sponsorship !== "Other" ? x.sponsorship : null,
      url: x.url,
      source: "Simplify",
      department: cat,
    };
    byKey.set(key, job);
    out.push(job);
  }
  return out;
}

export function simplifySlugs(jobs: Job[]) { return jobs.map((j) => j.simplifySlug).filter(Boolean) as string[]; }
