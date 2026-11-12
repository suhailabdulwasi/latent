// Explanations for the detector: per-sentence scores and the patterns that moved the score.
import { ModelFile, normalize, score, sentences, tokens, ngrams, AI_PHRASES, words } from "./core";

export interface SentenceScore { text: string; start: number; end: number; p: number }

export function sentenceScores(m: ModelFile, normText: string): SentenceScore[] {
  const s = sentences(normText);
  return s.map((x, i) => {
    const win = s.slice(Math.max(0, i - 1), i + 2).map((y) => y.text).join(" ");
    return { text: x.text, start: x.start, end: x.end, p: score(m, win).p };
  });
}

export interface GramSignal { gram: string; weight: number; count: number }

const pretty = (g: string) => g.replace(/<w-'>/g, "…'…").replace(/<w(?:-[a-z]+)?>/g, "…").replace(/<num>/g, "#").replace(/ ([,.;:!?)])/g, "$1").replace(/\( /g, "(");

// Which word patterns pushed the score toward AI or toward human writing.
export function gramSignals(m: ModelFile, normText: string, k = 8) {
  const grams = ngrams(tokens(normText));
  const counts = new Map<string, number>();
  for (const g of grams) counts.set(g, (counts.get(g) || 0) + 1);
  let norm = 0;
  const parts: GramSignal[] = [];
  counts.forEach((c, g) => {
    const v = m.ngram.vocab[g];
    if (!v) return;
    const x = (1 + Math.log(c)) * v[0];
    norm += x * x;
    parts.push({ gram: g, weight: x * v[1], count: c });
  });
  const n = Math.sqrt(norm) || 1;
  parts.forEach((p) => (p.weight /= n));
  // keep patterns a person can read: must contain a real word or a distinctive mark
  const readable = parts.filter((p) => {
    const bare = p.gram.replace(/<[^>]+>/g, "").trim();
    if (/^(?:—|#|\* \*)$/.test(p.gram)) return true; // single distinctive marks
    return /[a-z]{2,}/.test(bare) && !/^(?:the|a|an|of|to|and|is|in|it|i|you)$/.test(p.gram);
  });
  const dedupe = (arr: GramSignal[]) => {
    const out: GramSignal[] = []; const seen = new Set<string>();
    for (const p of arr) { const key = pretty(p.gram); if (seen.has(key)) continue; seen.add(key); out.push({ ...p, gram: key }); if (out.length >= k) break; }
    return out;
  };
  return {
    ai: dedupe(readable.filter((p) => p.weight > 0).sort((a, b) => b.weight - a.weight)),
    human: dedupe(readable.filter((p) => p.weight < 0).sort((a, b) => a.weight - b.weight)),
  };
}

export function phrasesFound(normText: string): { phrase: string; count: number }[] {
  const lower = normText.toLowerCase();
  const out: { phrase: string; count: number }[] = [];
  for (const p of AI_PHRASES) {
    const re = new RegExp("\\b" + p.replace(/[-]/g, "\\-") + "\\b", "g");
    const c = (lower.match(re) || []).length;
    if (c) out.push({ phrase: p, count: c });
  }
  return out.sort((a, b) => b.count - a.count);
}

export function textStats(normText: string) {
  const s = sentences(normText).map((x) => words(x.text).length).filter((n) => n > 0);
  const w = words(normText);
  const mean = s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
  const sd = s.length ? Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length) : 0;
  return {
    words: w.length,
    sentences: s.length,
    avgSentence: mean,
    variation: mean ? sd / mean : 0,
    emDashes: (normText.match(/—|--/g) || []).length,
    contractions: (normText.match(/\b[a-z]+'(?:t|s|re|ve|ll|d|m)\b/gi) || []).length,
  };
}

export function analyze(m: ModelFile, raw: string) {
  const t = normalize(raw);
  const res = score(m, t);
  return { ...res, sentences: sentenceScores(m, t), grams: gramSignals(m, t), phrases: phrasesFound(t), stats: textStats(t) };
}
