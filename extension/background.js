const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// LatentFill background service worker: orchestrates collect -> AI -> fill, and calls the AI provider.
importScripts("llm.js", "cover-letter.js");

const FILL_SYSTEM_PROMPT = `You fill out job application forms on behalf of a candidate.
You receive JSON with: the candidate's profile, resume text, extra notes (standard answers), the job context, and a list of form fields.
Return ONLY JSON in the form {"answers": {"<field id>": <value>, ...}}.

Rules:
- Use only facts from the profile, resume, and notes. Never invent employers, titles, dates, degrees, GPAs, numbers, or credentials. If a value is unknown, leave the field out of "answers".
- For "select", "radio", and "combobox" fields that list options, return the exact text of one option. For "combobox" without options, return the plain value (e.g. a city name or school).
- For "checkbox_group", return an array of exact option texts. For "checkbox", return true or false.
- inputType "date" -> YYYY-MM-DD. inputType "month" -> YYYY-MM. inputType "number" -> digits only.
- Copy email, phone, and URLs exactly from the profile. Use the field's label to tell first name, last name, and full name apart.
- Work authorization, sponsorship, relocation, salary, notice period, start date: answer from profile/notes. If not provided, leave out.
- Demographic / EEO questions (gender, race, ethnicity, Hispanic/Latino, veteran, disability, sexual orientation, pronouns): use profile.eeo if set; otherwise pick the option closest to "Decline to self-identify" / "I don't wish to answer" if one exists, else leave out.
- "How did you hear about us": use notes if given, otherwise pick a job board / company website style option if one exists.
- Open-ended questions (why this company, why this role, cover letter, describe a project, additional info): write a specific, first-person answer grounded in the resume and the job context, 60-150 words unless maxLength is smaller. Plain, confident language. No clichés, no em dashes, no placeholders like [Company].
- For cover-letter text fields, use the reviewed coverLetter draft when supplied; shorten only if maxLength requires it.
- Always respect maxLength.
- Leave out: passwords, SSN / national ID numbers, date of birth, and consent / terms / privacy-policy / certification checkboxes (the candidate reviews those). A typed-name e-signature field may be filled with the full name.
- Do not include fields of type "file".
- "today" is today's date (YYYY-MM-DD). Use it for signature-date / "today's date" fields, in the field's format (placeholder like MM/DD/YYYY). For "available start date" use a sensible date from notes, or leave blank.
- Fields may have "section" (the heading they sit under) and "entry" (1-based). In repeated Education / Work experience sections, entry N is the Nth item of profile.education / profile.experience (resume order, most recent first). Fill every field of an entry from that same item, never mixing entries.
- Dates: copy them exactly from the profile/resume (and memory facts, which win). Match the field's format: separate month and year dropdowns get the month name / year of that date; text date fields follow their placeholder (e.g. MM/YYYY). A current job or ongoing degree has no end date (or use the expected graduation date for education if the field asks for one).
- For "combobox" fields, the listed options may be only the first page of a searchable list. If the right answer (e.g. the candidate's school) isn't listed, return the exact correct name anyway; it will be searched.

Memory (the candidate's running memory) is the most trusted source:
- "memory.facts" are things the candidate taught you directly. They override the profile and resume when they conflict.
- "memory.pastAnswers" are answers the candidate gave or corrected on earlier applications ("corrected" = they fixed your answer, highest trust). When a field asks the same thing, even with different wording, reuse that answer, adapted to the current field's options and format.
- If facts conflict with each other, the one with the newer date wins.`;

const PARSE_SYSTEM_PROMPT = `You convert a resume into structured JSON for job applications.
Return ONLY JSON with exactly this shape (use null or [] when unknown; never invent data):
{
  "resumeText": "full plain-text transcription of the resume",
  "profile": {
    "firstName": null, "lastName": null, "preferredName": null,
    "email": null, "phone": null,
    "location": { "address": null, "city": null, "state": null, "zip": null, "country": null },
    "links": { "linkedin": null, "github": null, "portfolio": null, "other": [] },
    "currentTitle": null, "currentCompany": null, "yearsExperience": null,
    "experience": [ { "title": "", "company": "", "location": null, "startDate": "YYYY-MM", "endDate": "YYYY-MM or null", "current": false, "highlights": [] } ],
    "education": [ { "school": "", "degree": null, "field": null, "startDate": null, "endDate": null, "gpa": null, "minors": [] } ],
    "projects": [], "technicalTraining": [],
    "skills": [], "certifications": [], "languages": []
  }
}`;

const DEFAULT_PREFS = {
  workAuthorization: { authorizedToWorkInUS: null, requiresSponsorship: null },
  preferences: { desiredSalary: null, noticePeriod: null, earliestStartDate: null, willingToRelocate: null, remotePreference: null },
  eeo: { gender: null, pronouns: null, hispanicLatino: null, race: null, veteranStatus: null, disabilityStatus: null }
};

async function getSettings() {
  return chrome.storage.local.get(["provider", "apiKey", "model", "baseUrl", "profile", "resumeText", "notes", "resumeFile", "overwrite", "stats", "coverLetterTemplate", "coverLetterDraft", "autoCoverLetter", "preciseDropdowns", "autoNextPage"]);
}

// ---------- Running memory ----------
const normQ = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set("a an the of to for and or in on at you your are is do did have has with what when which how please this that be will would".split(" "));
const tokens = (t) => new Set(normQ(t).split(" ").filter((w) => w && !STOP.has(w)));
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach((w) => B.has(w) && inter++);
  return inter / Math.min(A.size, B.size);
}
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);

async function getMemory() {
  const { memory } = await chrome.storage.local.get("memory");
  return { facts: memory?.facts || [], answers: memory?.answers || [] };
}
async function saveMemory(m) {
  m.answers = m.answers.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 600);
  await chrome.storage.local.set({ memory: m });
  return m;
}

async function learn(items, host) {
  const m = await getMemory();
  for (const it of items) {
    if (!it.question || !it.answer) continue;
    const qn = normQ(it.question);
    const existing = m.answers.find((a) => a.qn === qn);
    if (existing) {
      // Latest value always wins; keep the "corrected" flag once the user has fixed it.
      existing.a = it.answer;
      existing.source = it.source === "corrected" || existing.source === "corrected" ? "corrected" : "confirmed";
      existing.date = today();
      existing.host = host;
      existing.uses = (existing.uses || 1) + 1;
      if (it.options) existing.options = it.options;
    } else {
      m.answers.push({ id: uid(), q: it.question, qn, a: it.answer, type: it.type, options: it.options, source: it.source, host, date: today(), uses: 1 });
    }
  }
  return saveMemory(m);
}

async function teach(text) {
  const t = String(text || "").trim();
  if (!t) throw new Error("Type something to remember.");
  const m = await getMemory();
  m.facts.push({ id: uid(), text: t.slice(0, 1000), date: today() });
  return saveMemory(m);
}

// Pick only the memories relevant to this form so the prompt stays small.
function relevantMemory(m, fields) {
  const picked = new Map();
  if (m.answers.length <= 80) m.answers.forEach((a) => picked.set(a.id, a));
  for (const f of fields) {
    m.answers
      .map((a) => ({ a, s: similarity(a.q, f.label) }))
      .filter((x) => x.s >= 0.5)
      .sort((x, y) => y.s - x.s || (y.a.source === "corrected") - (x.a.source === "corrected"))
      .slice(0, 3)
      .forEach((x) => picked.set(x.a.id, x.a));
  }
  return {
    facts: m.facts.slice(-150).map((f) => ({ fact: f.text, date: f.date })),
    pastAnswers: [...picked.values()].slice(0, 120).map((a) => ({ question: a.q, answer: a.a, source: a.source, date: a.date }))
  };
}

// ---------- Trusted input for custom dropdowns ----------
// Some ATS dropdowns (e.g. Greenhouse's react-select) ignore synthetic events, so during a run we
// attach Chrome's debugger to the tab and send real keystrokes. Detached as soon as the run ends.
const debugTabs = new Set();
async function attachDebugger(tabId) {
  if (debugTabs.has(tabId)) return true;
  try { await chrome.debugger.attach({ tabId }, "1.3"); debugTabs.add(tabId); return true; }
  catch (e) { console.warn("LatentFill: precise dropdown mode unavailable:", e.message); return false; }
}
async function detachDebugger(tabId) {
  if (!debugTabs.delete(tabId)) return;
  try { await chrome.debugger.detach({ tabId }); } catch (_) {}
}
chrome.debugger.onDetach.addListener((src) => debugTabs.delete(src.tabId));

const KEY_CODES = { ArrowDown: [40], ArrowUp: [38], Enter: [13, "\r"], Escape: [27], Backspace: [8], Tab: [9], " ": [32, " "] };
async function trustedInput(tabId, actions) {
  if (!debugTabs.has(tabId)) return false;
  const send = (method, params) => chrome.debugger.sendCommand({ tabId }, method, params);
  for (const a of actions || []) {
    if (a.insertText != null) { await send("Input.insertText", { text: String(a.insertText) }); continue; }
    if (a.click) {
      const { x, y } = a.click;
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      continue;
    }
    if (a.selectAll) {
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, commands: ["selectAll"] });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
      continue;
    }
    const k = KEY_CODES[a.key];
    if (!k) continue;
    const [code, text] = k;
    await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key: a.key, code: a.key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, ...(text ? { text, unmodifiedText: text } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: a.key, code: a.key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  }
  return true;
}

// Fallback: select through react-select's own API in the page's JS world.
async function reactSelect(tabId, frameId, marker, value) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId ?? 0] },
    world: "MAIN",
    args: [marker, value],
    func: (marker, want) => {
      const el = document.querySelector(`[data-latentfill-cb="${marker}"]`);
      if (!el) return { ok: false };
      const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
      let f = key && el[key], inst = null;
      for (let i = 0; f && i < 80; i++, f = f.return) {
        const sn = f.stateNode;
        if (sn && typeof sn.selectOption === "function" && sn.props) { inst = sn; break; }
      }
      if (!inst) return { ok: false };
      const flat = [];
      (inst.props.options || []).forEach((o) => (o && Array.isArray(o.options) ? flat.push(...o.options) : flat.push(o)));
      const label = (o) => String(inst.props.getOptionLabel ? inst.props.getOptionLabel(o) : o?.label ?? "");
      const n = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const w = n(want);
      const pick = flat.find((o) => n(label(o)) === w) || flat.find((o) => n(label(o)).startsWith(w) || (w.length > 3 && w.startsWith(n(label(o)))));
      if (!pick || (inst.props.isOptionDisabled && inst.props.isOptionDisabled(pick))) return { ok: false };
      inst.selectOption(pick);
      return { ok: true, label: label(pick) };
    }
  }).catch(() => [null]);
  return res?.result || { ok: false };
}

// The popup can close mid-run (e.g. when Chrome shows the debugging bar), so also report on the page.
async function showBanner(tabId, r) {
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [r, chrome.runtime.getManifest().version],
    func: (r, v) => {
      document.getElementById("latentfill-banner")?.remove();
      const items = [...new Set([...(r.review || []), ...(r.failed || []), ...(r.note ? [r.note] : [])])].filter(Boolean);
      const d = document.createElement("div");
      d.id = "latentfill-banner";
      d.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:420px;max-height:50vh;overflow:auto;background:#111827;color:#f9fafb;font:13px/1.45 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;padding:12px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.3)";
      const head = document.createElement("div");
      head.style.cssText = "font-weight:600;margin-bottom:4px;display:flex;justify-content:space-between;gap:12px";
      head.textContent = r.message || `LatentFill v${v}: filled ${r.filled} of ${r.total}${r.autoRun ? " (next page)" : ""}`;
      const x = document.createElement("button");
      x.textContent = "×";
      x.style.cssText = "background:none;border:0;color:#9ca3af;font-size:18px;line-height:1;cursor:pointer";
      x.onclick = () => d.remove();
      head.appendChild(x);
      d.appendChild(head);
      if (items.length) {
        const ul = document.createElement("ul");
        ul.style.cssText = "margin:4px 0 0;padding-left:18px";
        for (const t of items) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); }
        d.appendChild(ul);
      }
      if (r.auto) {
        const p = document.createElement("div");
        p.style.cssText = "margin-top:8px;color:#9ca3af;font-size:12px";
        p.textContent = "It will keep filling the next pages of this application. ";
        const stop = document.createElement("a");
        stop.textContent = "Stop";
        stop.href = "#";
        stop.style.cssText = "color:#93c5fd";
        stop.onclick = (e) => { e.preventDefault(); chrome.runtime.sendMessage({ type: "STOP_AUTO" }); p.textContent = "Stopped. Click Autofill to start again."; };
        p.appendChild(stop);
        d.appendChild(p);
      }
      document.body.appendChild(d);
    }
  });
}

const COVER_RE = /cover[\s_-]*letter|letter of (interest|motivation)|motivation[\s_-]*letter/i;

// ---------- Keep filling the next pages of an application ----------
const siteOf = (url) => { try { return new URL(url).hostname.split(".").slice(-2).join("."); } catch (_) { return ""; } };
async function getAuto() { return (await chrome.storage.session.get("autoTabs")).autoTabs || {}; }
async function setAuto(a) { await chrome.storage.session.set({ autoTabs: a }); }
async function armAuto(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  const a = await getAuto();
  a[tabId] = { site: siteOf(tab.url), until: Date.now() + 45 * 60e3, runs: a[tabId]?.runs || [] };
  await setAuto(a);
}
async function stopAuto(tabId) { const a = await getAuto(); delete a[tabId]; await setAuto(a); }
async function autoRun(tabId, why) {
  const a = await getAuto();
  const e = a[tabId];
  if (!e || Date.now() > e.until) { if (e) await stopAuto(tabId); return; }
  const s = await getSettings();
  if (s.autoNextPage === false) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || siteOf(tab.url) !== e.site) { await stopAuto(tabId); return; }
  const now = Date.now();
  e.runs = (e.runs || []).filter((t) => now - t < 10 * 60e3);
  if (e.runs.length >= 12 || (e.runs.length && now - e.runs[e.runs.length - 1] < 4000)) return;
  // Only run on pages that look like an application form (not job lists with a search box).
  const looks = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
      const els = [...document.querySelectorAll("input:not([type=hidden]):not([type=search]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea, select, [role=combobox]")]
        .filter((el) => vis(el) && !el.closest("[role=search], header, nav") && !/search|filter|keyword/i.test((el.getAttribute("placeholder") || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.name || "")));
      const files = document.querySelectorAll("input[type=file]").length;
      return els.length >= 2 || files > 0;
    }
  }).catch(() => []);
  if (!looks.some((r) => r.result)) return;
  e.runs.push(now);
  await setAuto(a);
  runAutofill(tabId, { auto: why }).catch(() => {});
}
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const a = await getAuto();
  if (a[tabId]) setTimeout(() => autoRun(tabId, "page"), 1800);
});
chrome.tabs.onRemoved.addListener((tabId) => { stopAuto(tabId).catch(() => {}); });

const runningTabs = new Set();
async function runAutofill(tabId, opts = {}) {
  if (runningTabs.has(tabId)) return { filled: 0, total: 0, failed: [], review: [], message: "LatentFill is already filling this page." };
  runningTabs.add(tabId);
  const s0 = await getSettings();
  const precise = s0.preciseDropdowns !== false && (await attachDebugger(tabId));
  try {
    const r = await runAutofillInner(tabId);
    if (!precise && r && !r.message) r.note = "Precise dropdown mode was unavailable (close DevTools on this tab to enable it).";
    const keepGoing = s0.autoNextPage !== false && !r.message;
    if (keepGoing) await armAuto(tabId);
    r.auto = keepGoing;
    // Auto runs stay quiet when there was nothing new to fill.
    if (!opts.auto || (!r.message && r.total > 0)) showBanner(tabId, { ...r, autoRun: !!opts.auto }).catch(() => {});
    return r;
  } catch (e) {
    if (opts.auto) return { error: e.message };
    throw e;
  } finally {
    runningTabs.delete(tabId);
    await detachDebugger(tabId);
  }
}

async function runAutofillInner(tabId) {
  // Some sites (Workable) edit one education / job entry at a time: Add -> fill -> Update.
  // Repeat the pass for each remaining resume entry after confirming the previous one.
  const offset = { education: 0, experience: 0 };
  let total = null;
  const seenSigs = new Set();
  let followUps = 0, followMode = false;
  for (let round = 0; round < 6; round++) {
    const r = await runAutofillPass(tabId, offset, round, followMode ? seenSigs : null);
    followMode = false;
    for (const g of r.sigs || []) seenSigs.add(g);
    if (!total) total = r;
    else if (!r.message) {
      total.filled += r.filled; total.total += r.total;
      total.failed.push(...r.failed); total.review.push(...r.review.filter((x) => !total.review.includes(x)));
    }
    if (r.message && round > 0) break;
    const c = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => (window.__latentfillCommit ? window.__latentfillCommit() : null) }).catch(() => []);
    const kinds = c.flatMap((x) => x.result?.committed || []);
    if (!kinds.length) {
      // Answers can reveal follow-up questions (e.g. "If yes, explain", signature after a disability answer).
      if (followUps >= 2 || r.message) break;
      await sleep(500);
      const q = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => (window.__latentfillCollect ? window.__latentfillCollect({ noProbe: true }) : null) }).catch(() => []);
      const fresh = q.some((x) => (x.result?.fields || []).some((f) => f.type !== "file" && !seenSigs.has(`${x.frameId}|${f.type}|${f.label}`)));
      if (!fresh) break;
      followUps++;
      followMode = true;
      continue;
    }
    for (const k of kinds) offset[k]++;
    const want = r.counts || {};
    if (!((offset.education < (want.education || 0)) || (offset.experience < (want.experience || 0)))) break;
    await sleep(600);
  }
  return total;
}

async function runAutofillPass(tabId, offset = {}, round = 0, exclude = null) {
  const s = await getSettings();
  if (!s.apiKey && s.provider !== "openai_compatible") throw new Error("Add your API key in Settings first.");
  if (!s.profile && !s.resumeText) throw new Error("Add your resume in Settings first.");

  // 1. Inject content script into every frame (no-op if already there).
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] }).catch(() => {});

  // 2. Open education / work-history entries so there is one per resume item.
  const prof = s.profile || {};
  let counts = {
    education: (prof.education || []).filter((e) => e && (e.school || e.degree)).length,
    experience: (prof.experience || []).filter((e) => e && (e.company || e.title)).length
  };
  const probe = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => (window.__latentfillExpand ? window.__latentfillExpand({}) : null) }).catch(() => []);
  if (probe.some((p) => p.result?.hasAdders)) {
    if (!counts.education && !counts.experience && s.resumeText) {
      try {
        const c = await callLLM(s, 'Count entries on this resume. Return ONLY JSON {"education": <number of schools/degrees>, "experience": <number of jobs/positions incl. internships>}.', s.resumeText.slice(0, 15000));
        counts = { education: Number(c.education) || 0, experience: Number(c.experience) || 0 };
      } catch (_) {}
    }
    const remaining = { education: Math.max(0, counts.education - (offset.education || 0)), experience: Math.max(0, counts.experience - (offset.experience || 0)) };
    if (remaining.education || remaining.experience) {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: (c) => (window.__latentfillExpand ? window.__latentfillExpand(c) : null), args: [remaining] }).catch(() => {});
    }
  }

  // 3. Collect fields from every frame.
  const collected = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (opts) => (window.__latentfillCollect ? window.__latentfillCollect(opts) : null),
    args: [{ overwrite: !!s.overwrite, entryOffset: offset, noProbe: false }]
  });

  const [topTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = topTab?.id === tabId ? topTab : await chrome.tabs.get(tabId);
  if (s.coverLetterDraft?.url !== currentTab.url) s.coverLetterDraft = null;
  const sigs = [];
  for (const fr of collected) for (const f of fr.result?.fields || []) sigs.push(`${fr.frameId}|${f.type}|${f.label}`);
  // Follow-up passes only handle questions that weren't there before.
  if (exclude) for (const fr of collected) if (fr.result) fr.result.fields = fr.result.fields.filter((f) => !exclude.has(`${fr.frameId}|${f.type}|${f.label}`));
  const frames = collected.filter((r) => r.result && r.result.fields.length);
  if (!frames.length) return { filled: 0, total: 0, failed: [], review: [], counts, sigs, message: "No empty form fields found on this page." };

  const allFields = [];
  let job = null;
  for (const fr of frames) {
    for (const f of fr.result.fields) {
      if (f.type === "file") continue;
      allFields.push({ ...f, id: `${fr.frameId}_${f.id}` });
    }
    const j = fr.result.job;
    if (!job || (j.description || "").length > (job.description || "").length) job = j;
  }

  // Auto-write a tailored cover letter when the application asks for one.
  let coverNote = null;
  const wantsCover = frames.some((fr) => fr.result.fields.some((f) => COVER_RE.test(f.label || "")));
  if (wantsCover && !s.coverLetterDraft && s.autoCoverLetter !== false && job?.description) {
    try {
      const text = await writeCoverLetter(s, job);
      s.coverLetterDraft = { text, url: currentTab.url, title: currentTab.title };
      await chrome.storage.local.set({ coverLetterDraft: s.coverLetterDraft });
      coverNote = "Wrote a tailored cover letter. Review it (Settings > Cover letter) before submitting.";
    } catch (e) {
      coverNote = "Couldn't write a cover letter: " + e.message;
    }
  }

  // 3. Ask the AI for answers (one call for the whole page).
  let answers = {};
  if (allFields.length) {
    const memory = await getMemory();
    const payload = {
      memory: relevantMemory(memory, allFields),
      profile: s.profile || {},
      resumeText: (s.resumeText || "").slice(0, 15000),
      notes: s.notes || "",
      job,
      today: new Date().toLocaleDateString("en-CA"),
      coverLetter: s.coverLetterDraft?.text || null,
      fields: allFields
    };
    const out = await callLLM(s, FILL_SYSTEM_PROMPT, JSON.stringify(payload));
    answers = out.answers || out || {};
  }

  // 4. Fill each frame with its own answers.
  let filled = 0;
  const failed = [], review = [];
  for (const fr of frames) {
    const prefix = `${fr.frameId}_`;
    const local = {};
    for (const [k, v] of Object.entries(answers)) if (k.startsWith(prefix)) local[k.slice(prefix.length)] = v;
    const fileInputCount = fr.result.fields.filter((f) => f.type === "file").length;
    const [res] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [fr.frameId] },
      func: (a, extras) => window.__latentfillFill(a, extras),
      args: [local, { resume: s.resumeFile || null, coverLetter: s.coverLetterDraft?.text ? coverLetterPDF(s.coverLetterDraft.text, s.profile) : null, coverLetterText: s.coverLetterDraft?.text || null, fileInputCount }]
    });
    if (res?.result) {
      filled += res.result.filled;
      failed.push(...res.result.failed);
      review.push(...res.result.review);
    }
  }

  const total = frames.reduce((n, fr) => n + fr.result.fields.length, 0);
  const today = new Date().toISOString().slice(0, 10);
  const stats = s.stats && s.stats.day === today ? s.stats : { day: today, runs: 0, allTime: s.stats?.allTime || 0 };
  stats.runs++; stats.allTime++;
  await chrome.storage.local.set({ stats });
  if (coverNote) review.unshift(coverNote);
  return { filled, total, failed, review, stats, counts, sigs };
}

async function parseResume() {
  const s = await getSettings();
  const pdf = s.resumeFile && /pdf/i.test(s.resumeFile.type) ? s.resumeFile : null;
  const text = (s.resumeText || "").trim();
  if (!text && !pdf) throw new Error("Upload a PDF resume or paste your resume text first.");
  const userMsg = text ? `Resume text:\n\n${text}` : "The resume is attached as a PDF.";
  const out = await callLLM(s, PARSE_SYSTEM_PROMPT, userMsg, text ? null : pdf);
  const parsed = out.profile || out;
  const existing = s.profile || {};
  // Keep the user's own answers for authorization / preferences / EEO.
  const profile = {
    ...existing,
    ...parsed,
    workAuthorization: existing.workAuthorization || DEFAULT_PREFS.workAuthorization,
    preferences: existing.preferences || DEFAULT_PREFS.preferences,
    standardAnswers: existing.standardAnswers || {},
    eeo: existing.eeo || DEFAULT_PREFS.eeo
  };
  const update = { profile };
  if (!text && out.resumeText) update.resumeText = out.resumeText;
  await chrome.storage.local.set(update);
  return update;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handle = async () => {
    if (msg.type === "TRUSTED_INPUT") return sender.tab ? trustedInput(sender.tab.id, msg.actions) : false;
    if (msg.type === "REACT_SELECT") return sender.tab ? reactSelect(sender.tab.id, sender.frameId, msg.marker, msg.value) : { ok: false };
    if (msg.type === "RUN_AUTOFILL") return runAutofill(msg.tabId);
    if (msg.type === "NEXT_STEP") { if (sender.tab) autoRun(sender.tab.id, "step"); return true; }
    if (msg.type === "STOP_AUTO") { if (sender.tab) await stopAuto(sender.tab.id); return true; }
    if (msg.type === "GENERATE_COVER_LETTER") return generateCoverLetter(msg.tabId);
    if (msg.type === "PARSE_RESUME") return parseResume();
    if (msg.type === "LEARN") return learn(msg.items || [], msg.host).then((m) => ({ answers: m.answers.length }));
    if (msg.type === "TEACH") return teach(msg.text).then((m) => ({ facts: m.facts.length }));
    if (msg.type === "GET_MEMORY") return getMemory();
    if (msg.type === "SAVE_MEMORY") return saveMemory({ facts: msg.memory.facts || [], answers: msg.memory.answers || [] });
    if (msg.type === "TEST_KEY") return callLLM(await getSettings(), "Reply with JSON.", 'Return {"ok": true}');
    throw new Error("Unknown message");
  };
  handle().then((r) => sendResponse({ ok: true, result: r })).catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true;
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "run-autofill") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  chrome.action.setBadgeText({ tabId: tab.id, text: "..." });
  try {
    const r = await runAutofill(tab.id);
    chrome.action.setBadgeBackgroundColor({ color: r.review.length ? "#f59e0b" : "#16a34a" });
    chrome.action.setBadgeText({ tabId: tab.id, text: String(r.filled) });
  } catch (e) {
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    console.error(e);
  }
});
