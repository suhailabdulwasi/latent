import type { Job, Profile } from "@shared/schema";
import { SENIORITIES } from "@shared/schema";

export interface Scored extends Job {
  /** Internships only: does it satisfy the term rule (summer anywhere; school terms remote or in a school city)? */
  eligible: boolean;
  termNote: string;
  score: number;
  reasons: string[];
  gaps: string[];
  matchedSkills: string[];
}

const SUMMER = "Summer 2027";

export function termFit(job: Job, p: Profile): { ok: boolean; note: string; known: boolean } {
  const wanted = job.terms.filter((t) => p.terms.includes(t));
  if (!job.terms.length) return { ok: true, note: "Term not stated", known: false };
  if (!wanted.length) return { ok: false, note: `${job.terms.join(", ")} not in your terms`, known: true };
  if (wanted.includes(SUMMER)) return { ok: true, note: "Summer 2027 — any US location works", known: true };
  const loc = job.location.toLowerCase();
  const city = p.schoolCities.find((c) => c.trim() && loc.includes(c.trim().toLowerCase()));
  const term = wanted.join(" / ");
  if (job.workMode === "Remote") return { ok: true, note: `${term} and remote — works during the school year`, known: true };
  if (city) return { ok: true, note: `${term} in ${city} — works during the school year`, known: true };
  return { ok: false, note: `${term} on-site — school terms need remote or ${p.schoolCities[0] ?? "your school city"}`, known: true };
}

function scoreIntern(job: Job, p: Profile): Scored {
  let score = 0;
  const reasons: string[] = [];
  const gaps: string[] = [];
  if (p.categories.includes(job.category)) { score += 25; reasons.push(`Target track: ${job.category}`); }
  else { score += 10; gaps.push(`${job.category} is outside your target tracks`); }

  const tf = termFit(job, p);
  if (tf.ok && tf.known) { score += 30; reasons.push(tf.note); }
  else if (tf.ok) { score += 12; gaps.push("Term not stated on the posting"); }
  else gaps.push(tf.note);

  const loc = job.location.toLowerCase();
  const prefHit = p.locations.find((l) => l.trim() && loc.includes(l.trim().toLowerCase()));
  if (job.workMode === "Remote") { score += 15; reasons.push("Remote"); }
  else if (prefHit) { score += 15; reasons.push(`In a preferred area (${prefHit.replace(/^,\s*/, "")})`); }
  else if (job.usBased) { score += 8; gaps.push("Not in one of your preferred areas"); }
  else gaps.push("Location unclear");

  const sizeTxt = job.companySize ? ` · ${job.companySize}` : "";
  if (p.companyTypes.includes(job.companyType)) { score += 20; reasons.push(`${job.companyType === "Startup" ? "Startup" : job.companyType + " company"}${sizeTxt}`); }
  else if (job.companyType === "Unknown") { score += 8; gaps.push("Company size unknown"); }
  else gaps.push(`${job.companyType} company${sizeTxt}`);

  if (job.payHourlyMax != null) {
    if (p.minHourly > 0 && job.payHourlyMax < p.minHourly) { score -= 10; gaps.push(`Pay tops out below $${p.minHourly}/hr`); }
    else { score += 5; reasons.push(`Pay listed: ${job.salaryText}`); }
  }
  const mine = new Set(p.skills.map((s) => s.toLowerCase()));
  const matchedSkills = job.skills.filter((s) => mine.has(s.toLowerCase()));
  if (matchedSkills.length) { score += Math.min(5, matchedSkills.length * 2); reasons.push(`Skills: ${matchedSkills.slice(0, 4).join(", ")}`); }
  else if (!job.skills.length) score += 3;

  return { ...job, eligible: tf.ok, termNote: tf.note, score: Math.max(0, Math.min(100, score)), reasons, gaps, matchedSkills };
}

export function scoreJob(job: Job, p: Profile): Scored {
  if (job.kind === "internship") return scoreIntern(job, p);
  let score = 0;
  const reasons: string[] = [];
  const gaps: string[] = [];

  if (p.categories.includes(job.category)) { score += 30; reasons.push(`Target role: ${job.category}`); }
  else gaps.push(`Outside your target roles`);

  const si = SENIORITIES.indexOf(job.seniority);
  const wanted = p.seniorities.map((s) => SENIORITIES.indexOf(s as any));
  if (p.seniorities.includes(job.seniority)) { score += 20; reasons.push(`${job.seniority} level fits`); }
  else if (job.seniority !== "Intern" && job.seniority !== "Manager" && wanted.some((w) => Math.abs(w - si) === 1)) { score += 10; gaps.push(`${job.seniority} is one step off your level`); }
  else gaps.push(`${job.seniority} level not targeted`);

  const mine = new Set(p.skills.map((s) => s.toLowerCase()));
  const matchedSkills = job.skills.filter((s) => mine.has(s.toLowerCase()));
  if (job.skills.length === 0) score += 12;
  else {
    const denom = Math.min(4, job.skills.length);
    score += Math.round(30 * Math.min(1, matchedSkills.length / denom));
    if (matchedSkills.length) reasons.push(`Skills: ${matchedSkills.slice(0, 4).join(", ")}`);
    const missing = job.skills.filter((s) => !mine.has(s.toLowerCase())).slice(0, 3);
    if (missing.length) gaps.push(`Mentions ${missing.join(", ")}`);
  }

  const loc = job.location.toLowerCase();
  const prefHit = p.locations.find((l) => l.trim() && loc.includes(l.trim().toLowerCase()));
  if (job.workMode === "Remote" && p.remoteOk && !job.intlOnly) { score += 20; reasons.push("Remote"); }
  else if (prefHit) { score += 20; reasons.push(`In ${prefHit}`); }
  else if (job.usBased && p.openToRelocate) { score += 10; gaps.push("Would need to relocate"); }
  else gaps.push(job.intlOnly ? "Outside the US" : job.usBased ? "Not in your locations" : "Location unclear");

  if (p.minSalaryK > 0 && job.salaryMaxK != null) {
    if (job.salaryMaxK < p.minSalaryK) { score -= 20; gaps.push(`Pay tops out below $${p.minSalaryK}K`); }
    else if (job.salaryMinK != null && job.salaryMinK >= p.minSalaryK) reasons.push("Clears your pay floor");
  }
  if (job.stage && !p.stages.includes(job.stage)) { score -= 15; gaps.push(`${job.stage} stage not preferred`); }

  return { ...job, eligible: true, termNote: "", score: Math.max(0, Math.min(100, score)), reasons, gaps, matchedSkills };
}

export function scoreTone(score: number) {
  if (score >= 75) return "strong";
  if (score >= 55) return "good";
  return "weak";
}

export function isNew(job: Job, days = 7) {
  if (!job.postedAt) return false;
  return Date.now() - new Date(job.postedAt).getTime() < days * 86400000;
}

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function addedWithin(job: Job, hours = 24) {
  return !!job.firstSeenAt && Date.now() - new Date(job.firstSeenAt).getTime() < hours * 3600000;
}
