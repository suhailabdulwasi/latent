// Latent Write — rule-based humanizer.
// Every edit is a transparent, meaning-preserving rule: no new facts are added.

export type Tone = "casual" | "standard" | "academic";
export interface HumanizeOptions { tone: Tone; strength: 1 | 2 | 3; seed?: number }
export interface HumanizeResult { text: string; edits: { rule: string; count: number }[] }

type Rep = [RegExp, string | string[], string, number?]; // pattern, replacement(s), rule label, min strength

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

function matchCase(src: string, rep: string): string {
  if (!rep) return rep;
  if (src[0] && src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase()) return rep[0].toUpperCase() + rep.slice(1);
  return rep;
}

// Chatbot framing that people rarely write themselves.
const FRAMING: RegExp[] = [
  /^(sure|certainly|absolutely|of course|great question|good question|okay|alright)[!,.]?\s+(here(?:'s| is| are)[^.:\n]*[.:]\s*)?/i,
  /^here(?:'s| is| are) (?:a|an|the|my|some)\b[^.:\n]{0,80}:\s*\n+/i,
  /\n*\s*(?:i hope (?:this|that) helps[^.\n]*[.!]?|let me know if[^.\n]*[.!]?|feel free to[^.\n]*[.!]?|happy to help[^.\n]*[.!]?|good luck[!.]?)\s*$/i,
];

const PHRASES: Rep[] = [
  [/\bin today's (?:fast-paced|ever-changing|modern|digital) (?:world|society|age|landscape)\b,?\s*/gi, ["these days, ", "today, "], "Cliché openers"],
  [/\bin (?:the realm|the world) of\b/gi, "in", "Cliché openers"],
  [/\bit(?:'s| is) (?:important|crucial|essential|worth) (?:to note|noting|to remember|to mention) that\s+/gi, "", "Filler phrases"],
  [/\bit(?:'s| is) worth (?:noting|mentioning) that\s+/gi, "", "Filler phrases"],
  [/\bplays? an? (?:crucial|vital|pivotal|key|significant|important) role in\b/gi, ["matters a lot for", "is a big part of", "helps shape"], "Stock phrases"],
  [/\bserves as an? (?:powerful |important |vital |key )?(?:reminder|testament)\b(?: of| that| to)?/gi, ["shows", "is proof of"], "Stock phrases"],
  [/\bstands as an? testament to\b/gi, "shows", "Stock phrases"],
  [/\bis an? testament to\b/gi, ["shows", "proves"], "Stock phrases"],
  [/\ban? testament to\b/gi, ["proof of", "a sign of"], "Stock phrases"],
  [/\ba (?:rich )?tapestry of\b/gi, ["a mix of", "a range of"], "AI vocabulary"],
  [/\b(?:a )?myriad (?:of )?\b/gi, ["lots of ", "many "], "AI vocabulary"],
  [/\ba plethora of\b/gi, ["lots of", "plenty of"], "AI vocabulary"],
  [/\bdelve(?:s|d)? (?:deeper )?into\b/gi, ["look at", "get into", "dig into"], "AI vocabulary"],
  [/\bdelving (?:deeper )?into\b/gi, ["looking at", "digging into"], "AI vocabulary"],
  [/\bembark(?:s|ed)? on\b/gi, ["start", "begin"], "AI vocabulary"],
  [/\bnavigat(?:e|ing) the complexities of\b/gi, ["deal with", "handle"], "AI vocabulary"],
  [/\bnavigate\b/gi, ["handle", "deal with", "get through"], "AI vocabulary", 2],
  [/\bnavigating\b/gi, ["handling", "dealing with", "getting through"], "AI vocabulary", 2],
  [/\bever-evolving\b/gi, ["changing", "shifting"], "AI vocabulary"],
  [/\bfast-paced\b/gi, "busy", "AI vocabulary", 2],
  [/\bgame-?changer\b/gi, ["big deal", "huge shift"], "AI vocabulary"],
  [/\bseamless(?:ly)?\b/gi, ["smooth", "easy"], "AI vocabulary"],
  [/\bleverag(?:e|ing)\b/gi, ["use", "using"], "AI vocabulary"],
  [/\butiliz(?:e|es|ed|ing)\b/gi, "use", "AI vocabulary"],
  [/\butilization\b/gi, "use", "AI vocabulary"],
  [/\bfoster(?:s|ed)?\b/gi, ["build", "encourage"], "AI vocabulary"],
  [/\bfostering\b/gi, ["building", "encouraging"], "AI vocabulary"],
  [/\bharness(?:ing)? the power of\b/gi, ["use", "make use of"], "AI vocabulary"],
  [/\bunlock(?:s|ing)? the (?:full )?potential of\b/gi, ["get the most out of", "make the most of"], "AI vocabulary"],
  [/\bempower(?:s)?\b/gi, ["help", "let"], "AI vocabulary", 2],
  [/\bholistic\b/gi, ["whole", "big-picture"], "AI vocabulary"],
  [/\bmultifaceted\b/gi, ["complicated", "layered"], "AI vocabulary"],
  [/\bintricate\b/gi, ["complex", "detailed"], "AI vocabulary"],
  [/\bintricacies\b/gi, ["details", "ins and outs"], "AI vocabulary"],
  [/\bnuanced\b/gi, ["subtle", "complicated"], "AI vocabulary", 2],
  [/\bpivotal\b/gi, ["key", "big"], "AI vocabulary"],
  [/\bparamount\b/gi, ["key", "the top priority"], "AI vocabulary"],
  [/\bcrucial\b/gi, ["key", "important", "big"], "AI vocabulary"],
  [/\bvital\b/gi, ["key", "important"], "AI vocabulary", 2],
  [/\bessential\b/gi, ["key", "important", "needed"], "AI vocabulary", 3],
  [/\brobust\b/gi, ["strong", "solid"], "AI vocabulary"],
  [/\bvibrant\b/gi, ["lively", "busy"], "AI vocabulary"],
  [/\bbustling\b/gi, ["busy", "crowded"], "AI vocabulary"],
  [/\bcaptivating\b/gi, ["gripping", "interesting"], "AI vocabulary"],
  [/\btransformative\b/gi, ["big", "major"], "AI vocabulary"],
  [/\binvaluable\b/gi, ["really useful", "very helpful"], "AI vocabulary"],
  [/\bmeticulous(?:ly)?\b/gi, ["careful", "detailed"], "AI vocabulary"],
  [/\bcomprehensive\b/gi, ["full", "thorough", "complete"], "AI vocabulary"],
  [/\bprofound(?:ly)?\b/gi, ["deep", "big"], "AI vocabulary", 2],
  [/\bunderscore(?:s|d)?\b/gi, ["show", "highlight"], "AI vocabulary"],
  [/\bshowcas(?:e|es|ed|ing)\b/gi, ["show", "shows", "showed", "showing"], "AI vocabulary"],
  [/\belevat(?:e|es)\b/gi, ["raise", "improve"], "AI vocabulary"],
  [/\benhance(?:s)?\b/gi, ["improve", "boost"], "AI vocabulary", 2],
  [/\benhancing\b/gi, ["improving", "boosting"], "AI vocabulary", 2],
  [/\bstreamlin(?:e|es)\b/gi, ["simplify", "speed up"], "AI vocabulary", 2],
  [/\bresonates? with\b/gi, ["clicks with", "makes sense to", "connects with"], "AI vocabulary"],
  [/\bcommendable\b/gi, ["impressive", "good"], "AI vocabulary"],
  [/\b(?:the )?landscape of\b/gi, ["the world of", ""], "AI vocabulary", 2],
  [/\brealm\b/gi, ["area", "world"], "AI vocabulary"],
  [/\bfacilitat(?:e|es)\b/gi, ["help", "make easier"], "Wordy phrasing"],
  [/\bcommenc(?:e|es)\b/gi, ["start", "begin"], "Wordy phrasing"],
  [/\bendeavou?r(?:s)?\b/gi, ["effort", "try"], "Wordy phrasing", 2],
  [/\bin order to\b/gi, "to", "Wordy phrasing"],
  [/\bdue to the fact that\b/gi, "because", "Wordy phrasing"],
  [/\bat this point in time\b/gi, "now", "Wordy phrasing"],
  [/\bin the event that\b/gi, "if", "Wordy phrasing"],
  [/\bfor the purpose of\b/gi, "for", "Wordy phrasing"],
  [/\ba wide (?:range|array|variety) of\b/gi, ["lots of", "all kinds of", "many"], "Wordy phrasing"],
  [/\bnumerous\b/gi, ["many", "lots of"], "Wordy phrasing"],
  [/\bsubsequently\b/gi, ["later", "then"], "Wordy phrasing"],
  [/\bprior to\b/gi, "before", "Wordy phrasing"],
  [/\bin terms of\b/gi, ["for", "when it comes to"], "Wordy phrasing", 3],
  [/\bvaluable insights?\b/gi, ["useful ideas", "a lot"], "AI vocabulary"],
  [/\binsights\b/gi, ["ideas", "lessons", "takeaways"], "AI vocabulary", 2],
  [/\bkey takeaways?\b/gi, ["main points", "the main thing"], "AI vocabulary"],
  [/\bat its core,?\s*/gi, ["basically, ", "really, "], "Filler phrases"],
  [/\bin essence,?\s*/gi, ["basically, ", ""], "Filler phrases"],
];

// Tone-aware swaps for sentence patterns the detector found most typical of AI text.
// [pattern, casual, standard, academic, label, min strength]
type Swap = [RegExp, string[], string[], string[], string, number];
const SWAPS: Swap[] = [
  [/, including\b/gi, [", like"], [", like", ", for example"], [", for example"], "Common AI patterns", 1],
  [/,? such as\b/gi, [" like"], [" like"], [" such as"], "Common AI patterns", 1],
  [/\bit(?:'s| is) (?:really |very |also )?(?:important|essential|crucial|key) to\b/gi, ["you should", "you want to"], ["it helps to", "you should"], ["one should"], "Common AI patterns", 1],
  [/\b(is|are) (?:very |really |so |also )?important\b(?= (?:for|because|in|when|here)\b|[.,;!?])/gi, ["$1 a big deal", "matter$s"], ["matter$s"], ["matter$s"], "Common AI patterns", 1],
  [/\btypically\b/gi, ["usually"], ["usually", "generally"], ["generally"], "Common AI patterns", 1],
  [/\b(is|are) often\b/gi, ["$1 usually", "$1 a lot of the time"], ["$1 usually", "$1 frequently"], ["$1 frequently"], "Common AI patterns", 2],
  [/(?<=[a-z]) additionally\b/g, ["also"], ["also"], ["also"], "Overused transitions", 1],
  [/(?<=[a-z],? )ultimately\b/g, ["in the end"], ["in the end"], ["in the end"], "Overused transitions", 2],
  [/\bthere are several\b/gi, ["there are a bunch of", "there are some"], ["there are a number of", "there are some"], ["there are a number of"], "Common AI patterns", 1],
  [/\b(?:is |are )?known for\b/gi, ["$&"], ["$&"], ["$&"], "", 9],
  [/\bdesigned to\b/gi, ["meant to", "built to"], ["meant to", "built to"], ["intended to"], "Common AI patterns", 2],
  [/\ba type of\b/gi, ["a kind of"], ["a kind of"], ["a kind of"], "Common AI patterns", 2],
  [/\ba variety of\b/gi, ["all sorts of", "lots of"], ["many", "different"], ["various"], "Common AI patterns", 1],
  [/\bpotential (?=[a-z]+s\b)/gi, ["possible "], ["possible "], ["possible "], "Common AI patterns", 2],
  [/, leading to\b/gi, [", causing", ", and that leads to"], [", causing", ", which causes"], [", resulting in"], "Common AI patterns", 2],
  [/\b(will|would|could|is|are|was|were|most) likely\b/gi, ["$1 probably"], ["$1 probably"], ["$1 probably"], "Common AI patterns", 2],
  [/\b(?:extremely|incredibly|highly|exceptionally)\b(?= [a-z]+(?:ly|ble|ful|ive|ant|ent|ous|ic|al|ed|ing)?\b)/gi, ["really", "very"], ["very"], ["very"], "Intensifiers", 2],
  [/\bas a result,\s*/gi, ["so ", "because of that, "], ["so ", "because of that, "], ["therefore, ", "thus, "], "Common AI patterns", 2],
  [/\bthis means that\b/gi, ["so"], ["so", "that means"], ["therefore,"], "Common AI patterns", 2],
  [/\bbecause of\b/gi, ["because of"], ["because of"], ["due to"], "Common AI patterns", 3],
];

// Sentence-initial transitions that AI text overuses.
const TRANSITIONS: [RegExp, string[], string][] = [
  [/^(?:additionally|furthermore|moreover|in addition),\s*/i, ["", "Also, ", "Plus, ", "And "], "Overused transitions"],
  [/^(?:ultimately|overall|notably|importantly|consequently|thus|hence|therefore),\s*/i, ["", "So ", ""], "Overused transitions"],
  [/^in conclusion,\s*/i, ["So, ", "All in all, ", "In the end, "], "Overused transitions"],
  [/^in summary,\s*/i, ["So, ", "Basically, "], "Overused transitions"],
  [/^(?:firstly|first and foremost),\s*/i, ["First, ", ""], "Overused transitions"],
  [/^secondly,\s*/i, ["Second, ", "Then, ", "Also, "], "Overused transitions"],
  [/^lastly,\s*/i, ["Last, ", "Finally, ", "And "], "Overused transitions"],
  [/^however,\s*/i, ["But ", "Still, ", "However, "], "Overused transitions"],
  [/^for instance,\s*/i, ["For example, ", "Like, "], "Overused transitions"],
];

const CONTRACTIONS: [RegExp, string][] = [
  [/\b(do|does|did|is|are|was|were|has|have|had|could|would|should|must) not\b/gi, "$1n't"],
  [/\bcan ?not\b/gi, "can't"],
  [/\bwill not\b/gi, "won't"],
  [/\b(I) am\b(?=\s+[a-z])/g, "$1'm"],
  [/\b(you|we|they) are\b(?=\s+[a-z])/gi, "$1're"],
  [/\b(it|that|there|here|what|who|he|she) is\b(?=\s+[a-z])/gi, "$1's"],
  [/\b(I|you|we|they) will\b(?=\s+[a-z])/gi, "$1'll"],
  [/\b(I|you|we|they) have\b(?=\s+(?:been|done|made|had|seen|got|gotten|never|always|already|just|to)\b)/gi, "$1've"],
  [/\b(I|you|he|she|we|they) would\b(?=\s+[a-z])/gi, "$1'd"],
  [/\blet us\b/gi, "let's"],
];

function splitLong(sentence: string, maxWords: number, r: () => number, casual: boolean): string[] {
  const n = sentence.split(/\s+/).length;
  if (n < maxWords) return [sentence];
  // prefer semicolons, then ", but", ", and", ", which"
  const tries: [RegExp, (a: string, b: string) => [string, string]][] = [
    [/;\s+/, (a, b) => [a + ".", cap(b)]],
    [/,\s+but\s+/, (a, b) => [a + ".", "But " + b]],
    [/,\s+and\s+(?=[a-z]+\s)/, (a, b) => [a + ".", (casual && r() < 0.4 ? "And " + b : cap(b))]],
    [/,\s+so\s+/, (a, b) => [a + ".", "So " + b]],
    [/,\s+while\s+/, (a, b) => [a + ".", "Meanwhile, " + b]],
  ];
  for (const [re, f] of tries) {
    const m = re.exec(sentence);
    if (!m) continue;
    const a = sentence.slice(0, m.index), b = sentence.slice(m.index + m[0].length);
    if (a.split(/\s+/).length < 6 || b.split(/\s+/).length < 6) continue;
    const [x, y] = f(a, b);
    return [...splitLong(x, maxWords, r, casual), ...splitLong(y, maxWords, r, casual)];
  }
  return [sentence];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function humanize(input: string, opt: HumanizeOptions): HumanizeResult {
  const r = rng(opt.seed ?? 7);
  const counts: Record<string, number> = {};
  const bump = (k: string, n = 1) => { if (n > 0) counts[k] = (counts[k] || 0) + n; };
  let t = input.replace(/\r\n?/g, "\n").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

  // 1. Markdown → plain prose
  const before = t;
  t = t.replace(/^#{1,6}\s+(.+)$/gm, "$1");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,!?]|$)/g, "$1$2");
  // bullet lists: short items become one sentence, long items become sentences
  t = t.replace(/(?:^[ \t]*(?:[-*•]|\d+[.)])[ \t]+.+(?:\n|$))+/gm, (block) => {
    const items = block.trim().split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim());
    const short = items.every((i) => i.split(/\s+/).length <= 6 && !/[.!?]$/.test(i));
    if (short && items.length > 1) {
      const low = items.map((i, k) => (k === 0 ? i : i.charAt(0).toLowerCase() + i.slice(1)));
      const joined = low.length === 2 ? low.join(" and ") : low.slice(0, -1).join(", ") + ", and " + low[low.length - 1];
      return joined + ".\n";
    }
    return items.map((i) => (/[.!?]$/.test(i) ? i : i + ".")).join(" ") + "\n";
  });
  // "Key benefits:\nBetter memory and ..." → "Key benefits: better memory and ..."
  t = t.replace(/:\n([A-Z])(?=[a-z])/g, (_m, c: string) => ": " + c.toLowerCase());
  if (t !== before) bump("Markdown and bullet formatting");

  // 2. Chatbot framing
  for (const re of FRAMING) { const b = t; t = t.replace(re, ""); if (b !== t) bump("Chatbot framing"); }

  // 3. Phrase-level replacements
  for (const [re, rep, label, min] of PHRASES) {
    if ((min ?? 1) > opt.strength) continue;
    t = t.replace(re, (m) => {
      bump(label);
      const choice = Array.isArray(rep) ? rep[Math.floor(r() * rep.length)] : rep;
      return matchCase(m, choice);
    });
  }
  for (const [re, ca, st, ac, label, min] of SWAPS) {
    if (min > opt.strength) continue;
    const pool = opt.tone === "casual" ? ca : opt.tone === "academic" ? ac : st;
    t = t.replace(re, (m: string, g1?: string) => {
      bump(label);
      let c = pool[Math.floor(r() * pool.length)];
      if (typeof g1 === "string") {
        c = c.replace("$1", g1).replace("$s", /^are$/i.test(g1) ? "" : "s");
      } else c = c.replace("$s", "s");
      const mLead = (m.match(/^[, ]+/) || [""])[0], cLead = (c.match(/^[, ]+/) || [""])[0];
      return (cLead || mLead) + matchCase(m.slice(mLead.length), c.slice(cLead.length));
    });
  }
  // Serial (Oxford) comma: "A, B, and C" → "A, B and C"
  t = t.replace(/(, [A-Za-z'-]+(?: [A-Za-z'-]+){0,2}), (and|or) (?=[a-z])/g, (_m, a: string, cj: string) => { bump("Serial commas"); return a + " " + cj + " "; });
  // "not only X but also Y" → "X and Y"
  t = t.replace(/\bnot only ([^,.;]{2,60}?),? but also\b/gi, (_m, x) => { bump("Stock phrases"); return x + " and also"; });

  // 4. Em dashes (a strong tell in modern chatbot text)
  // paired dashes are parenthetical: "X—each note—builds" → "X, each note, builds"
  t = t.replace(/([a-z\d])—([^—\n]{5,200}?)—([a-z])/g, (_m, a: string, mid: string, b: string) => a + ", " + mid + ", " + b);
  t = t.replace(/\s*(?:—|--)\s*([A-Za-z0-9"'(])?/g, (_m, next: string | undefined) => {
    bump("Em dashes");
    const n = next ?? "";
    if (opt.tone !== "academic" && r() >= 0.7 && /[a-z]/.test(n)) return ". " + n.toUpperCase();
    return ", " + n;
  });
  t = t.replace(/,\s*,/g, ",").replace(/,\s*([.!?])/g, "$1");

  // 5. Sentence-level rewrites (protect decimals like 1.25 from being split at the period)
  t = t.replace(/(\d)\.(?=\d)/g, "$1\u0001");
  const paras = t.split(/\n{2,}/);
  const outParas = paras.map((p) => {
    const sents = p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [p];
    const out: string[] = [];
    for (let s of sents) {
      s = s.trim();
      if (!s) continue;
      for (const [re, reps, label] of TRANSITIONS) {
        if (re.test(s)) {
          const pool = opt.tone === "academic" ? reps.filter((c) => !/^(And|Plus|So|Like|Basically)\b/.test(c)) : reps;
          if (!pool.length) break;
          const choice = pool[Math.floor(r() * pool.length)];
          s = s.replace(re, choice);
          s = cap(s);
          bump(label);
          break;
        }
      }
      const max = opt.strength === 3 ? 24 : opt.strength === 2 ? 28 : 36;
      const parts = splitLong(s, max, r, opt.tone === "casual");
      if (parts.length > 1) bump("Long sentences split", parts.length - 1);
      out.push(...parts);
    }
    return out.join(" ");
  });
  t = outParas.join("\n\n");

  // 5b. Structural rhythm pass: break up even, listy comma chains (strength 2+)
  if (opt.strength >= 2) {
    const flat = outParas.join("\n\n");
    let merged = flat.replace(/([a-z])\s+(The|This|That|These|Those|It)\b/g, (m, a, b) => a + (r() < 0.5 ? " and " + b.toLowerCase() : ". " + b));
    if (merged !== flat) { bump("Merged short sentences"); t = merged; }
  }

  // 5d. Sentence-length variety: if all sentences in a paragraph are within 4 words of each other
  // and there are 3+, join two adjacent short ones or split differently (burstiness)
  {
    const paras = t.split(/\n{2,}/);
    const outP = paras.map((p) => {
      const sents = p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [p];
      if (sents.length < 3) return p;
      const lens = sents.map((s) => s.trim().split(/\s+/).length);
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
      const even = lens.every((l) => Math.abs(l - mean) <= 4);
      if (!even) return p;
      // join two shortest adjacent with " and "
      let best = -1, bestSum = 1e9;
      for (let i = 0; i < lens.length - 1; i++) {
        const sum = lens[i] + lens[i + 1];
        if (sum < bestSum) { bestSum = sum; best = i; }
      }
      if (best < 0) return p;
      const a = sents[best].trim().replace(/[.!?]+$/, "");
      const b = sents[best + 1].trim();
      if (a.split(/\s+/).length < 5 || b.split(/\s+/).length < 5) return p;
      const joined = a + " and " + b.charAt(0).toLowerCase() + b.slice(1);
      sents.splice(best, 2, joined + " ");
      bump("Broke up even sentence rhythm");
      return sents.join(" ");
    });
    t = outP.join("\n\n");
  }

  // 5e. Paragraph breaks: a paragraph over ~90 words with no internal break gets one,
  // after a sentence that ends a thought (people write in uneven chunks)
  if (opt.strength >= 2) {
    const paras = t.split(/\n{2,}/);
    const outP = paras.map((p) => {
      const words = p.split(/\s+/).length;
      if (words < 90) return p;
      const sents = p.match(/[^.!?]+[.!?]+["')\]]*\s*/g) || [];
      if (sents.length < 4) return p;
      // split near 60% point
      let acc = 0, cut = 0;
      for (let i = 0; i < sents.length; i++) {
        acc += sents[i].split(/\s+/).length;
        if (acc >= words * 0.6) { cut = i + 1; break; }
      }
      if (cut < 1 || cut >= sents.length - 1) return p;
      bump("Split long paragraphs");
      return sents.slice(0, cut).join("").trim() + "\n\n" + sents.slice(cut).join("").trim();
    });
    t = outP.join("\n\n");
  }

  // 5c. Relative-clause pass: break up ", which" and ", while" chains at strength 2+.
  // These are the heaviest AI-leaning n-grams left after humanizing, so at higher
  // strength we rewrite a share of them instead of relying on word swaps alone.
  if (opt.strength >= 2) {
    const BAD2 = new Set(["each", "all", "some", "both", "making", "keeping", "letting", "showing", "using", "leaving", "doing", "going"]);
    let nWhich = 0, nWhile = 0;
    t = t.replace(/, which\s+(?=[a-z]+)/g, () => {
      if (r() < (opt.strength === 3 ? 0.75 : 0.4)) { nWhich++; return ". This "; }
      return ", which ";
    });
    t = t.replace(/, while\s+([a-z]+)/g, (m, w: string) => {
      if (r() < 0.5 && !BAD2.has(w)) { nWhile++; return ". But " + w; }
      return m;
    });
    if (nWhich) bump("Split 'which' clauses", nWhich);
    if (nWhile) bump("Split 'while' clauses", nWhile);
  }

  t = t.replace(/\u0001/g, ".");

  // 5f. Hedges: people flag their claims ("I think", "arguably") far more than chatbots
  // do. Inserted at sentence starts, tone-aware, grammar-safe (only before common
  // sentence-opening words that can be safely lowercased).
  {
    const POOL: Record<Tone, string[]> = {
      casual: ["I think", "honestly", "I mean", "to me", "kind of"],
      standard: ["I think", "in practice", "actually", "to me"],
      academic: ["arguably", "in practice", "in many cases", "broadly speaking", "in general"],
    };
    const LOWERABLE = new Set("the this that these those it they we you he she there one such".split(" "));
    const rate = opt.strength === 3 ? 0.5 : opt.strength === 2 ? 0.2 : 0.07;
    if (opt.strength >= 2) {
      const pool = POOL[opt.tone];
      let prevHedged = true; // don't hedge the first sentence or two in a row
      t = t.replace(/([.!?] )([A-Z][a-z]+)/g, (m, p: string, w: string) => {
        if (prevHedged || r() >= rate) { prevHedged = false; return m; }
        if (!LOWERABLE.has(w.toLowerCase())) { prevHedged = false; return m; }
        const h = pool[Math.floor(r() * pool.length)];
        prevHedged = true;
        bump("Hedges");
        return p + cap(h) + " " + w.charAt(0).toLowerCase() + w.slice(1);
      });
    }
  }

  // 5g. Comma-light coordination: drop the comma in "X, and Y" sometimes (informal prose)
  if (opt.strength >= 2 && opt.tone !== "academic") {
    let n = 0;
    t = t.replace(/, (and|or) (?=[a-z])/g, (m, cj: string) => {
      if (r() < 0.3) { n++; return " " + cj + " "; }
      return m;
    });
    if (n) bump("Lightened commas", n);
  }

  // 5h. Mid-sentence hedges at strength 3 (non-academic): "X, I think, is..."
  if (opt.strength === 3 && opt.tone !== "academic") {
    let n = 0;
    const BAD2 = new Set(["each", "all", "some", "both", "making", "keeping", "letting", "showing", "using", "leaving", "doing", "going"]);
    const BAD = new Set(["each", "all", "some", "both", "most", "few", "many", "one", "which", "that", "who"]);
    t = t.replace(/, ([a-z-]+) (is|are|was|were)\b/g, (m, w: string, v: string) => {
      if (BAD.has(w)) return m;
      if (r() < 0.25 && /s$/.test(w)) { n++; return ", " + w + " I think " + v; } // plural subject: "X I think are"
      if (r() < 0.12) { n++; return ", I think, " + w + " " + v; }
      return m;
    });
    if (n) bump("Hedges", n);
  }

  // 6. Contractions (people contract; chatbots and essays often don't)
  if (opt.tone !== "academic") {
    for (const [re, rep] of CONTRACTIONS) {
      const n = (t.match(re) || []).length;
      if (!n) continue;
      if (opt.tone === "standard" && r() < 0.35) continue; // standard tone keeps some formality
      bump("Contractions", n);
      t = t.replace(re, rep);
    }
  }

  // 7. Tidy spacing and fix a/an only where an edit created a new pairing
  t = t.replace(/ {2,}/g, " ").replace(/ ([,.;:!?])/g, "$1");
  const orig = new Set((input.toLowerCase().match(/\b(?:a|an) [a-z]+/g) || []));
  t = t.replace(/\b(a|an) ([A-Za-z]+)/g, (m, art: string, w: string) => {
    if (orig.has(m.toLowerCase())) return m;
    const c = w[0].toLowerCase();
    const upper = art[0] === "A";
    if ("aeio".includes(c) && art.toLowerCase() === "a") return (upper ? "An " : "an ") + w;
    if (!"aeiouh".includes(c) && art.toLowerCase() === "an") return (upper ? "A " : "a ") + w;
    return m;
  });
  t = t.trim();

  const edits = Object.entries(counts).map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count);
  return { text: t, edits };
}
