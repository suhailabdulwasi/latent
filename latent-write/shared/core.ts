import keepWords from "./keep.json";
// Latent Write — shared text analysis core.
// Used both by the training pipeline (via tsx in Node) and the browser, so
// features are computed identically at train time and at inference time.

export function normalize(raw: string): string {
  let t = raw.replace(/\r\n?/g, "\n").replace(/\\n/g, "\n");
  t = t.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"');
  t = t.replace(/\u00A0/g, " ").replace(/\u2026/g, "...");
  t = t.replace(/[\u2013]/g, "-");
  // Undo tokenizer artifacts found in some research datasets (" 've", " ,").
  t = t.replace(/ (n't|'s|'re|'ve|'ll|'d|'m)\b/gi, "$1");
  t = t.replace(/ ([,.;:!?%)])/g, "$1").replace(/([($]) /g, "$1");
  t = t.replace(/ +/g, " ").replace(/\n{3,}/g, "\n\n");
  t = t.split("\n").map((l) => l.trim()).join("\n");
  // Treat any line break as a paragraph break so single vs double newlines carry no signal.
  return t.trim().replace(/\n+/g, "\n\n");
}

const ABBR = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|U\.S|Inc|Ltd|No|Fig|al)\.$/i;

export interface Sentence { text: string; start: number; end: number; para: number }

// Split into sentences with character offsets into the normalized text.
export function sentences(t: string): Sentence[] {
  const out: Sentence[] = [];
  let para = 0;
  const re = /[^.!?\n]+(?:[.!?]+["')\]]*|\n|$)/g;
  let m: RegExpExecArray | null;
  let buf = ""; let bufStart = -1;
  while ((m = re.exec(t))) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    const piece = m[0];
    if (bufStart < 0) bufStart = m.index;
    buf += piece;
    const trimmed = buf.trim();
    const endsPara = piece.endsWith("\n");
    if (!endsPara && ABBR.test(trimmed) ) continue;
    if (trimmed.length > 0) {
      const lead = buf.length - buf.trimStart().length;
      out.push({ text: trimmed, start: bufStart + lead, end: bufStart + lead + trimmed.length, para });
    }
    if (endsPara && t[m.index + piece.length] === "\n") para++;
    buf = ""; bufStart = -1;
  }
  return out;
}

export function words(t: string): string[] {
  return t.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
}

// Tokens for the n-gram model: lowercased words plus punctuation marks,
// with numbers collapsed so the model learns style rather than specific figures.
let KEEP: Set<string> | null = null;
function keepSet(): Set<string> {
  if (!KEEP) {
    KEEP = new Set(keepWords as string[]);
    for (const p of AI_PHRASES) for (const w of p.split(/[\s-]+/)) KEEP.add(w);
  }
  return KEEP;
}

// Topic words are swapped for a shape token (e.g. "<w-ing>") so the detector
// learns how something is written rather than what it is about.
function shape(w: string): string {
  if (w.includes("'")) return "<w-'>";
  for (const s of ["ing", "ed", "ly", "tion", "ment", "ness", "ity", "ous", "ive", "al", "er", "est", "s"]) if (w.length > s.length + 2 && w.endsWith(s)) return "<w-" + s + ">";
  return w.length > 7 ? "<w-long>" : "<w>";
}

export function tokens(t: string): string[] {
  const raw = t.toLowerCase().match(/[a-z]+(?:'[a-z]+)?|[0-9]+(?:[.,][0-9]+)*|--|[—:;!?,.()"*#-]/g) || [];
  const keep = keepSet();
  return raw.map((x) => (/^[0-9]/.test(x) ? "<num>" : /^[a-z]/.test(x) && !keep.has(x) ? shape(x) : x));
}

export function ngrams(toks: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    out.push(toks[i]);
    if (i + 1 < toks.length) out.push(toks[i] + " " + toks[i + 1]);
    if (i + 2 < toks.length) out.push(toks[i] + " " + toks[i + 1] + " " + toks[i + 2]);
  }
  return out;
}

// Character 3-5 grams inside word boundaries (same idea as scikit-learn's char_wb).
export function charGrams(t: string): string[] {
  const out: string[] = [];
  for (const raw of t.toLowerCase().replace(/[0-9]/g, "0").split(/\s+/)) {
    if (!raw) continue;
    const w = " " + raw + " ";
    for (let n = 3; n <= 5; n++) {
      if (w.length < n) { out.push(w); continue; }
      for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n));
    }
  }
  return out;
}

// Words and phrases that show up far more often in AI-generated text.
export const AI_PHRASES: string[] = [
  "delve", "delves", "delving", "tapestry", "testament", "multifaceted", "realm", "landscape",
  "furthermore", "moreover", "additionally", "crucial", "pivotal", "paramount", "foster", "fostering",
  "navigate", "navigating", "seamless", "seamlessly", "robust", "vibrant", "embark", "leverage", "leveraging",
  "holistic", "nuanced", "intricate", "intricacies", "underscore", "underscores", "showcase", "showcasing",
  "elevate", "comprehensive", "ever-evolving", "game-changer", "harness", "harnessing", "unlock", "unlocking",
  "empower", "empowering", "transformative", "invaluable", "meticulous", "meticulously", "bustling",
  "in conclusion", "it's important to note", "it is important to note", "it's worth noting", "it is worth noting",
  "plays a crucial role", "plays a vital role", "a myriad of", "in today's", "fast-paced", "ultimately",
  "overall,", "notably", "in summary", "not only", "but also", "whether you're", "dive into", "deep dive",
  "at its core", "in essence", "serves as", "stands as", "a rich", "rich tapestry", "resonate", "resonates",
  "profound", "profoundly", "captivating", "commendable", "enhance", "enhancing", "streamline", "optimize",
  "insights", "valuable", "key takeaways", "remember,", "i hope this helps", "let me know if", "feel free to",
  "here's", "here are", "honestly,", "the reality is", "the truth is", "think of it", "imagine",
];

const STOP = new Set("the a an and or but of to in on for with at by from as is are was were be been being it this that these those i you he she we they my your our their his her its not no so if then than there here what which who whom whose when where why how all any both each few more most other some such only own same too very can will just do does did have has had".split(" "));

export const STYLE_NAMES = [
  "log_words", "sent_mean", "sent_cv", "sent_max_ratio", "mattr", "word_len", "comma_rate", "emdash_rate",
  "semicolon_rate", "colon_rate", "excl_rate", "question_rate", "paren_rate", "quote_rate", "contraction_rate",
  "first_person", "second_person", "ai_phrase_rate", "para_mean_sents", "lower_start_rate", "lowercase_i_rate",
  "digit_rate", "list_line_rate", "markdown_rate", "starter_repeat", "stop_ratio", "triplet_rate", "hedge_rate",
  "ellipsis_rate", "short_sent_rate", "long_sent_rate", "caps_word_rate",
];

export function styleFeatures(t: string): number[] {
  const s = sentences(t);
  const w = words(t);
  const nw = Math.max(w.length, 1);
  const ns = Math.max(s.length, 1);
  const lens = s.map((x) => words(x.text).length).filter((n) => n > 0);
  const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const sd = lens.length ? Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length) : 0;
  const max = lens.length ? Math.max(...lens) : 0;
  // moving-average type-token ratio, window 50
  let mattr = 0;
  if (w.length >= 50) {
    let acc = 0, cnt = 0;
    for (let i = 0; i + 50 <= w.length; i += 10) { acc += new Set(w.slice(i, i + 50)).size / 50; cnt++; }
    mattr = acc / cnt;
  } else mattr = new Set(w).size / nw;
  const count = (re: RegExp) => (t.match(re) || []).length;
  const lower = t.toLowerCase();
  let ai = 0;
  for (const p of AI_PHRASES) {
    let i = lower.indexOf(p);
    while (i >= 0) {
      const before = i === 0 ? " " : lower[i - 1];
      if (!/[a-z]/.test(before)) ai++;
      i = lower.indexOf(p, i + p.length);
    }
  }
  const paras = new Set(s.map((x) => x.para)).size || 1;
  const lines = t.split("\n").filter((l) => l.trim());
  const starters = s.map((x) => (words(x.text)[0] || ""));
  const starterCounts: Record<string, number> = {};
  starters.forEach((x) => { starterCounts[x] = (starterCounts[x] || 0) + 1; });
  const repeatStarts = Object.values(starterCounts).filter((c) => c > 1).reduce((a, b) => a + b, 0);
  const hedges = w.filter((x) => ["perhaps", "might", "may", "could", "possibly", "likely", "generally", "often", "typically", "usually", "arguably"].includes(x)).length;
  return [
    Math.log(nw),
    mean / 20,
    mean ? sd / mean : 0,
    mean ? max / mean / 3 : 0,
    mattr,
    w.reduce((a, b) => a + b.length, 0) / nw / 5,
    count(/,/g) / nw * 10,
    count(/—|--| - /g) / ns,
    count(/;/g) / ns,
    count(/:/g) / ns,
    count(/!/g) / ns,
    count(/\?/g) / ns,
    count(/\(/g) / ns,
    count(/"/g) / ns,
    w.filter((x) => /'(t|re|ve|ll|d|m|s)$/.test(x)).length / nw * 10,
    w.filter((x) => x === "i" || x === "me" || x === "my" || x === "i'm" || x === "i've" || x === "i'd" || x === "mine").length / nw * 10,
    w.filter((x) => x === "you" || x === "your" || x === "you're" || x === "yours").length / nw * 10,
    ai / nw * 100,
    ns / paras / 10,
    s.filter((x) => /^[a-z]/.test(x.text)).length / ns,
    count(/(^|\s)i(\s|')/g) / nw * 100,
    count(/[0-9]/g) / Math.max(t.length, 1) * 100,
    lines.filter((l) => /^\s*([-*•]|\d+[.)])\s/.test(l)).length / Math.max(lines.length, 1),
    count(/\*\*|^#+\s/gm) / ns,
    repeatStarts / ns,
    w.filter((x) => STOP.has(x)).length / nw,
    count(/\b\w+, \w+(?: \w+)?,? and \w+/g) / ns,
    hedges / nw * 10,
    count(/\.\.\./g) / ns,
    lens.filter((n) => n <= 6).length / ns,
    lens.filter((n) => n >= 35).length / ns,
    count(/\b[A-Z]{2,}\b/g) / nw * 10,
  ];
}

// ---------- Inference ----------

export interface NgramPart { vocab: Record<string, [number, number]>; bias: number; sublinear: boolean }
export interface ModelFile {
  version: string;
  ngram: NgramPart;
  chars: NgramPart;
  style: { mean: number[]; scale: number[]; coef: number[]; bias: number };
  stack: { a: number; b: number; e: number; c: number; d: number };
  calibration: { threshold: number; bands: { low: number; high: number }; by_length?: { max_words: number; threshold: number }[] };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function partLogit(part: NgramPart, grams: string[]): number {
  const counts = new Map<string, number>();
  for (const g of grams) counts.set(g, (counts.get(g) || 0) + 1);
  let dot = 0, norm = 0;
  // l2-normalised tf-idf over the full feature space; we only know idf for kept terms,
  // so the training pipeline uses the same restricted vocabulary.
  counts.forEach((c, g) => {
    const v = part.vocab[g];
    if (!v) return;
    const tf = part.sublinear ? 1 + Math.log(c) : c;
    const x = tf * v[0];
    norm += x * x;
    dot += x * v[1];
  });
  if (norm === 0) return part.bias;
  return dot / Math.sqrt(norm) + part.bias;
}

export const ngramLogit = (m: ModelFile, t: string) => partLogit(m.ngram, ngrams(tokens(t)));
export const charLogit = (m: ModelFile, t: string) => partLogit(m.chars, charGrams(t));

export function styleLogit(m: ModelFile, t: string): number {
  const f = styleFeatures(t);
  let z = m.style.bias;
  for (let i = 0; i < f.length; i++) z += ((f[i] - m.style.mean[i]) / m.style.scale[i]) * m.style.coef[i];
  return z;
}

// Same word count the training pipeline used (whitespace split of normalized text).
export const rawWordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;

// Short texts get a stricter bar so human writing is rarely flagged.
export function thresholdFor(m: ModelFile, nWords: number): number {
  const b = m.calibration.by_length;
  if (!b || !b.length) return m.calibration.threshold;
  for (const x of b) if (nWords < x.max_words) return x.threshold;
  return b[b.length - 1].threshold;
}

export function score(m: ModelFile, raw: string) {
  const t = normalize(raw);
  const a = ngramLogit(m, t);
  const b = styleLogit(m, t);
  const e = charLogit(m, t);
  const z = m.stack.a * a + m.stack.b * b + m.stack.e * e + m.stack.d * Math.log(Math.max(words(t).length, 1)) + m.stack.c;
  return { p: sigmoid(z), ngram: a, style: b, chars: e, text: t, threshold: thresholdFor(m, rawWordCount(t)) };
}
