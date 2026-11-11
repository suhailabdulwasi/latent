import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Jobs the user is tracking (saved, applied, ...). Snapshot fields keep the
// pipeline intact even if a posting is later taken down.
export const tracked = sqliteTable("tracked", {
  jobId: text("job_id").primaryKey(),
  status: text("status").notNull(), // saved | applied | interviewing | offer | closed | hidden
  notes: text("notes").notNull().default(""),
  title: text("title").notNull(),
  company: text("company").notNull(),
  url: text("url").notNull(),
  location: text("location").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

const safeUrl = z.string().max(2048).refine((u) => /^https?:\/\//i.test(u), "URL must be http(s)");
export const insertTrackedSchema = createInsertSchema(tracked, {
  jobId: z.string().min(1).max(200),
  status: z.enum(["saved", "applied", "interviewing", "offer", "closed", "hidden"]),
  notes: z.string().max(5000),
  title: z.string().max(300),
  company: z.string().max(200),
  url: safeUrl,
  location: z.string().max(300),
});
export type InsertTracked = z.infer<typeof insertTrackedSchema>;
export type Tracked = typeof tracked.$inferSelect;

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey(),
  data: text("data").notNull(), // JSON of Profile
});

export const CATEGORIES = [
  "ML Engineering",
  "AI / LLM Engineering",
  "Research",
  "ML Infra & MLOps",
  "Data Science",
  "Data Engineering",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SENIORITIES = ["Intern", "Entry", "Mid", "Senior", "Staff+", "Manager"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const STAGES = ["Early", "Growth", "Late-stage"] as const;
export type Stage = (typeof STAGES)[number];

export const STATUSES = ["saved", "applied", "interviewing", "offer", "closed"] as const;
export type Status = (typeof STATUSES)[number] | "hidden";

export const profileSchema = z.object({
  categories: z.array(z.string().max(80)).max(30),
  seniorities: z.array(z.string().max(80)).max(30),
  skills: z.array(z.string().max(80)).max(100),
  remoteOk: z.boolean(),
  locations: z.array(z.string().max(80)).max(50),
  openToRelocate: z.boolean(),
  minSalaryK: z.number().int().min(0).max(2000),
  stages: z.array(z.string().max(80)).max(10),
  // internship preferences
  terms: z.array(z.string().max(40)).max(10).default(["Summer 2027", "Fall 2027", "Winter 2027", "Spring 2027"]),
  schoolCities: z.array(z.string().max(80)).max(20).default(["Charlottesville"]),
  companyTypes: z.array(z.string().max(40)).max(10).default(["Startup", "Small"]),
  minHourly: z.number().int().min(0).max(300).default(0),
});
export type Profile = z.infer<typeof profileSchema>;

export const DEFAULT_PROFILE: Profile = {
  categories: ["ML Engineering", "AI / LLM Engineering", "Data Science"],
  seniorities: ["Intern", "Entry"],
  skills: ["Python", "PyTorch", "SQL", "LLMs", "RAG", "AWS", "TypeScript"],
  remoteOk: true,
  locations: ["Charlottesville", ", VA", "Virginia", "Washington", ", DC", "New York", "NYC", "San Francisco", "Boston"],
  openToRelocate: true,
  minSalaryK: 0,
  stages: ["Early", "Growth", "Late-stage"],
  terms: ["Summer 2027", "Fall 2027", "Winter 2027", "Spring 2027"],
  schoolCities: ["Charlottesville"],
  companyTypes: ["Startup", "Small"],
  minHourly: 0,
};

export const INTERN_TERMS = ["Summer 2027", "Fall 2027", "Winter 2027", "Spring 2027"] as const;
// Company size buckets (from public headcount ranges). "Startup" also covers
// the curated list of venture-backed AI startups regardless of headcount.
export const COMPANY_TYPES = ["Startup", "Small", "Mid-size", "Large", "Unknown"] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];
export const COMPANY_TYPE_LABEL: Record<CompanyType, string> = {
  Startup: "Startup (≤500)",
  Small: "Small (501–1k)",
  "Mid-size": "Mid-size (1k–5k)",
  Large: "Large (5k+)",
  Unknown: "Size unknown",
};

export type WorkMode = "Remote" | "Hybrid" | "Onsite";

export interface Job {
  id: string;
  title: string;
  company: string;
  companySlug: string;
  sector: string;
  stage: Stage | null;
  kind: "internship" | "fulltime";
  companyType: CompanyType;
  companySize: string | null; // e.g. "201-500 employees"
  simplifySlug?: string;
  terms: string[]; // internship terms, e.g. ["Summer 2027"]
  payHourlyMin: number | null;
  payHourlyMax: number | null;
  checkedAt: string | null; // last time the source confirmed it open
  degrees: string[];
  sponsorship: string | null;
  category: Category;
  seniority: Seniority;
  location: string;
  workMode: WorkMode;
  usBased: boolean;
  intlOnly: boolean;
  salaryMinK: number | null;
  salaryMaxK: number | null;
  salaryText: string | null;
  postedAt: string | null;
  firstSeenAt: string; // when this board first saw the posting
  skills: string[];
  url: string;
  source: "Greenhouse" | "Ashby" | "Simplify";
  department: string;
}

export interface JobsResponse {
  jobs: Job[];
  syncedAt: string | null;
  syncing: boolean;
  companiesOk: number;
  companiesTotal: number;
  failed: string[];
  history: DayStat[];
  refreshHours: number;
  internSource: { ok: boolean; count: number; syncedAt: string | null };
}

export interface DayStat {
  date: string; // YYYY-MM-DD (UTC)
  total: number;
  added: number;
  removed: number;
  syncs: number;
}
