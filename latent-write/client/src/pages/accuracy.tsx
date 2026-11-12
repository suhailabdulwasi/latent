import report from "@/data/report.json";
import evalData from "@/data/eval.json";
import { PageHeader } from "@/components/shell";
import { ExternalLink } from "lucide-react";

type Row = { n: number; n_ai: number; n_human: number; ai_caught?: number; human_false_flag?: number; accuracy: number; auc?: number };
const P = (x?: number) => (x == null ? "–" : `${(x * 100).toFixed(1)}%`);
const MODEL_NAMES: Record<string, string> = {
  claude_haiku_4_5: "Claude Haiku 4.5", claude_sonnet_5_5: "Claude Sonnet 5.5", gemini_3_flash: "Gemini 3 Flash",
  gpt5_mini: "GPT-5 mini", gpt_5_1: "GPT-5.1", grok_4_3: "Grok 4.3",
};
const SOURCE_NAMES: Record<string, string> = {
  "Latent-gen": "Modern chatbots (generated for Latent)", HC3: "HC3 (ChatGPT vs. human answers)", RAID: "RAID (abstracts, poetry)",
  MAGE: "MAGE (mixed domains, older models)", IvyPanda: "Student essays (IvyPanda)", "Enron email": "Work emails (Enron)", Reddit: "Reddit posts",
};
const DATASETS = [
  ["RAID", "https://huggingface.co/datasets/liamdugan/raid"], ["HC3", "https://huggingface.co/datasets/Hello-SimpleAI/HC3"],
  ["MAGE", "https://huggingface.co/datasets/yaful/MAGE"], ["IvyPanda essays", "https://huggingface.co/datasets/qwedsacf/ivypanda-essays"],
  ["AESLC (Enron emails)", "https://huggingface.co/datasets/Yale-LILY/aeslc"], ["Webis TLDR-17 (Reddit)", "https://huggingface.co/datasets/webis/tldr-17"],
];

function Metric({ label, value, sub, testid }: { label: string; value: string; sub: string; testid: string }) {
  return (
    <div className="rounded-lg border bg-card p-4" data-testid={testid}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function Bar({ v, tone = "primary" }: { v?: number; tone?: "primary" | "warn" }) {
  if (v == null) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><span className={`block h-full rounded-full ${tone === "warn" ? "bg-[hsl(var(--chart-5))]" : "bg-primary"}`} style={{ width: `${Math.min(100, v * 100)}%` }} /></span>
      <span className="font-mono tabular-nums text-xs">{P(v)}</span>
    </span>
  );
}

function Table({ head, rows, testid }: { head: string[]; rows: React.ReactNode[][]; testid: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card" data-testid={testid}>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs text-muted-foreground">{head.map((h, i) => <th key={i} className="px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b last:border-0">{r.map((c, j) => <td key={j} className="px-4 py-2.5 whitespace-nowrap">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold">{title}</h2>
      {desc && <p className="mt-1 mb-4 max-w-3xl text-sm text-muted-foreground">{desc}</p>}
      {!desc && <div className="mb-4" />}
      {children}
    </section>
  );
}

export default function Accuracy() {
  const o = report.overall as Row;
  const un = report.unseen_model as Row;
  const src = report.source as Record<string, Row>;
  const byModel = report.ai_model as Record<string, Row>;
  const len = report.length as Record<string, Row>;
  const dom = Object.entries(report.human_domain as Record<string, Row>).filter(([, v]) => v.n >= 40).sort((a, b) => (b[1].human_false_flag ?? 0) - (a[1].human_false_flag ?? 0));
  const ev = evalData as any;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader title="How accurate is it?" desc={`Every number here comes from text the detector never saw during training: ${o.n.toLocaleString()} held-out samples (${o.n_ai.toLocaleString()} AI, ${o.n_human.toLocaleString()} human) across 7 sources, plus every sample from one chatbot left out of training entirely. The model you use on this site is exactly the one tested.`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric testid="metric-caught" label="AI text caught" value={P(o.ai_caught)} sub="Scored as Likely AI" />
        <Metric testid="metric-falseflag" label="Human text wrongly flagged" value={P(o.human_false_flag)} sub="False positives, the costly mistake" />
        <Metric testid="metric-unseen" label={`Unseen chatbot (${MODEL_NAMES[report.holdout_model] ?? report.holdout_model})`} value={P(un.ai_caught)} sub="Never in the training data" />
        <Metric testid="metric-auc" label="Ranking quality (AUC)" value={(o.auc ?? 0).toFixed(3)} sub="1.0 is perfect, 0.5 is guessing" />
      </div>
      <p className="mt-3 max-w-3xl text-xs text-muted-foreground">The detector is tuned to be cautious: wrongly accusing a person is worse than missing some AI text. Each length range gets its own cutoff, chosen on a separate tuning set so that under 1% of human writing is flagged ({(report.thresholds ?? []).map((t: any, i: number) => `${["30-79", "80-149", "150-299", "300+"][i]} words: ${Math.round(t.threshold * 100)}`).join(", ")}). Anything above {Math.round(report.unclear_low * 100)} but below the cutoff is labeled Unclear. The trade-off is that roughly a third of AI text slips through as Unclear or Human.</p>
      <p className="mt-2 max-w-3xl text-xs text-muted-foreground">Scope: the detector targets text written by chat assistants (ChatGPT, Claude, Gemini, Grok, Llama-chat and similar). Older base models asked to continue a human-written opening are a different problem and are not included in training or these tests.</p>

      <Section title="By source" desc="Mistakes are not spread evenly. Older models in MAGE are the hardest to catch, and that same dataset also produces the most false flags.">
        <Table testid="table-source" head={["Source", "Samples", "AI caught", "Human wrongly flagged"]}
          rows={Object.entries(src).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [SOURCE_NAMES[k] ?? k, v.n.toLocaleString(), <Bar v={v.ai_caught} />, <Bar v={v.human_false_flag} tone="warn" />])} />
      </Section>

      <Section title="By length" desc="Short text is much harder, so it needs a higher score before it's called AI. Below 80 words the site shows a warning, and below 30 words it won't give a score.">
        <Table testid="table-length" head={["Words", "Samples", "AI caught", "Human wrongly flagged"]}
          rows={["30-79", "80-149", "150-299", "300+"].filter((k) => len[k]).map((k) => [k, len[k].n.toLocaleString(), <Bar v={len[k].ai_caught} />, <Bar v={len[k].human_false_flag} tone="warn" />])} />
      </Section>

      <Section title="By AI model" desc={<>Modern chatbot text was written from essay, email, story, review and discussion-post prompts, including prompts asking the model to sound human. {MODEL_NAMES[report.holdout_model]} was held out completely, which is the best preview of how the detector handles a model released after training.</>}>
        <Table testid="table-model" head={["Model", "Samples", "AI caught"]}
          rows={[...Object.entries(byModel).filter(([k]) => MODEL_NAMES[k]).sort((a, b) => (b[1].ai_caught ?? 0) - (a[1].ai_caught ?? 0)).map(([k, v]) => [MODEL_NAMES[k], v.n, <Bar v={v.ai_caught} />]),
            [<span>{MODEL_NAMES[report.holdout_model]} <span className="text-xs text-muted-foreground">(unseen)</span></span>, un.n, <Bar v={un.ai_caught} />],
            ...Object.entries(byModel).filter(([k]) => !MODEL_NAMES[k]).map(([k, v]) => [k, v.n.toLocaleString(), <Bar v={v.ai_caught} />])]} />
        <p className="mt-2 text-xs text-muted-foreground">Per-model samples are small (about 30 to 45 each), so treat differences of a few points as noise.</p>
      </Section>

      <Section title="Where human writing gets flagged" desc="Human writing types with at least 40 test samples, sorted by how often they were wrongly flagged. Short, formulaic summaries are the weak spot.">
        <Table testid="table-domain" head={["Human writing type", "Samples", "Wrongly flagged"]}
          rows={dom.slice(0, 10).map(([k, v]) => [k, v.n, <Bar v={v.human_false_flag} tone="warn" />])} />
      </Section>

      {ev?.external && (
        <Section title="Compared with open-source detectors" desc={<>Same {ev.external.n.toLocaleString()} texts, a balanced subset of the test set, scored by two public detectors at their default 50% cutoff. The HC3 RoBERTa model was trained on HC3 itself, an advantage on that slice, yet it misses most text from current chatbots. This subset is smaller than the full test set, so Latent's rates here differ a little from the headline numbers above.</>}>
          <Table testid="table-external" head={["Detector", "AUC", "AI caught", "Modern chatbots caught", "Human wrongly flagged"]}
            rows={ev.external.rows.map((r: any) => [
              r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">{r.name}<ExternalLink className="h-3 w-3" /></a> : <span className="font-medium">{r.name}</span>,
              <span className="font-mono text-xs">{r.auc.toFixed(3)}</span>, <Bar v={r.caught} />, <Bar v={r.caught_modern} />, <Bar v={r.false_flag} tone="warn" />])} />
          {ev.external.rows.some((r: any) => r.caught_at_latent_ff != null) && (
            <p className="mt-2 max-w-3xl text-xs text-muted-foreground">At their default cutoff the public detectors flag far more human writing. Held to Latent's false-flag rate on this sample, they would catch {ev.external.rows.filter((r: any) => r.caught_at_latent_ff != null).map((r: any) => `${P(r.caught_at_latent_ff)} (${r.name})`).join(" and ")} of AI text, versus {P(ev.external.rows[0].caught)} for Latent. Their cutoffs were picked on this same sample, which flatters them slightly.</p>
          )}
        </Section>
      )}

      {ev?.humanizer && (
        <Section title="Does the humanizer fool detectors?" desc={<>We ran the humanizer on {ev.humanizer.n} held-out modern-chatbot texts and checked them with every detector. For comparison, we also had Claude Sonnet 5.5 fully rewrite {ev.humanizer.n_llm} of them with instructions to sound human.</>}>
          <Table testid="table-humanizer" head={["Detector", "Original AI text flagged", "After Latent humanizer", "Full AI rewrite: original", "Full AI rewrite: after"]}
            rows={ev.humanizer.rows.map((r: any) => [r.name, <Bar v={r.before} tone="warn" />, <Bar v={r.after_rules} tone="warn" />, <Bar v={r.llm_before} tone="warn" />, <Bar v={r.after_llm} tone="warn" />])} />
          <p className="mt-2 max-w-3xl text-xs text-muted-foreground">{ev.humanizer.note}</p>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">The honest takeaway: the humanizer cleans up obvious tells and reads more naturally, and it lowers detection somewhat, more against Latent's cautious detector than against Fakespot. A full rewrite by a strong AI model does more, but Fakespot still catches most of those. No tool can promise undetectable text.</p>
        </Section>
      )}

      <Section title="Limitations">
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>No detector can prove who wrote something. Around {P(o.human_false_flag)} of human texts still get flagged, so a score should start a conversation, never end one.</li>
          <li>Writing by non-native English speakers, very formal or formulaic writing, and short summaries are flagged more often.</li>
          <li>AI text that a person has heavily edited, or that was written by a model released after training, is harder to catch.</li>
          <li>It's trained on English only.</li>
          <li>The detector looks at writing patterns: function words, punctuation, sentence rhythm and word shapes. In its main word-pattern model, topic words are replaced with placeholders so it can't learn shortcuts like "essays about social media are AI". A smaller character-level part still sees spelling, so topic effects are reduced, not eliminated.</li>
        </ul>
      </Section>

      <Section title="Data and credits" desc="Human and AI samples come from public research datasets, plus fresh samples from six current chatbots generated for this project.">
        <div className="flex flex-wrap gap-2">
          {DATASETS.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border bg-card px-2.5 py-1 text-xs hover:bg-secondary" data-testid={`link-dataset-${n.split(" ")[0].toLowerCase()}`}>{n}<ExternalLink className="h-3 w-3" /></a>)}
        </div>
      </Section>
    </div>
  );
}
