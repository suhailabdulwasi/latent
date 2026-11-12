// Prototype: char-aware synonym pass applied AFTER humanize (standard/strong).
// Also tests removing "honestly" from the hedge pool (it is the top non-keep
// char contributor, and the humanizer itself inserts it in casual tone).
import { readFileSync } from "fs";
import { score } from "../shared/core";
import { humanize } from "../shared/humanize";

const m = JSON.parse(readFileSync("client/src/data/model.json", "utf8"));
const rows = JSON.parse(readFileSync("handoff/heldout_sample.json", "utf8"));
const ai = rows.filter((r: any) => r.label === 1);

// Curated, meaning-preserving swaps for the highest-contribution non-keep words
// that have a genuinely interchangeable synonym. Words with no safe synonym
// (kitchen, bakery, semester...) are deliberately left out.
const SYN: Record<string, string[]> = {
  professor: ["teacher", "lecturer"],
  semester: ["term"],
  classroom: ["class"],
  excited: ["thrilled", "eager"],
  eager: ["keen", "excited"],
  assignment: ["task", "piece of work"],
  assignments: ["tasks"],
  classmates: ["peers", "classmates".length ? "fellow students" : "peers"],
  instructors: ["teachers"],
  honestly: ["frankly", "truthfully"],
  curious: ["interested", "intrigued"],
  curiosity: ["interest"],
  feedback: ["input", "notes"],
  failure: ["setback", "miss"],
  failures: ["setbacks"],
  frustrated: ["annoyed"],
  frustration: ["annoyance"],
  argue: ["say", "claim"],
  argue2: [""],
  prioritize: ["put first", "focus on"],
  internship: ["placement"],
  resume: ["CV"],
  deadline: ["due date"],
  deadlines: ["due dates"],
  commitment: ["promise"],
  sustainable: ["lasting"],
  accountability: ["responsibility"],
  workforce: ["staff"],
  coursework: ["classwork"],
  studying: ["reading"],
  genuinely: ["really", "truly"],
  skeptical: ["doubtful"],
  recommendation: ["suggestion"],
  importantly: ["notably"],
  tension: ["friction"],
  systemic: ["widespread"],
  oversight: ["supervision"],
  risks: ["dangers"],
  profound: ["deep"],
  landscape: ["scene"],
  recipe: ["method"],
  urban: ["city"],
  streets: ["roads"],
  quietly: ["softly"],
  midnight: ["late at night"],
  argument: ["case"],
  contributing: ["adding"],
  molecules: ["particles"],
  virus: ["bug"],
  batteries: ["cells"],
  grandmother: ["grandma"],
  genuine: ["real"],
  colors: ["shades"],
  typing: ["keying"],
  cooking: ["making food"],
  junior: ["third-year"],
  sophomore: ["second-year"],
  hiring: ["recruiting"],
  academic: ["school"],
  taught: ["showed"],
  giant: ["huge"],
  maple: ["sugar maple"],
  kitchen: [""],
};
function swap(t: string, seed: number): string {
  let s = seed >>> 0 || 1;
  const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  let out = t;
  for (const [k, alts] of Object.entries(SYN)) {
    const choices = alts.filter((a) => a);
    if (!choices.length) continue;
    out = out.replace(new RegExp(`\\b${k}\\b`, "gi"), (mm) => {
      const v = choices[Math.floor(r() * choices.length)];
      return mm[0] === mm[0].toUpperCase() ? v[0].toUpperCase() + v.slice(1) : v;
    });
  }
  return out;
}
function run(name: string, fn: (text: string, seed: number) => string) {
  let flagged = 0, avg = 0;
  for (const r of ai) {
    let bp = 1;
    for (let i = 1; i <= 10; i++) bp = Math.min(bp, score(m, fn(r.text, i)).p);
    avg += bp; flagged += +(bp >= score(m, r.text).threshold);
  }
  console.log(`${name}: ${(100 * flagged / ai.length).toFixed(1)}% still flagged, mean best p ${(avg / ai.length).toFixed(3)}`);
}
run("baseline standard/strong", (t, i) => humanize(t, { tone: "standard", strength: 3, seed: i }).text);
run("humanize + synonym swap", (t, i) => swap(humanize(t, { tone: "standard", strength: 3, seed: i }).text, i));
run("synonym swap only (no humanize)", (t, i) => swap(t, i));
