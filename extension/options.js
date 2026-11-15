const $ = (id) => document.getElementById(id);
let resumeFile = null;
let coverDraft = null;

const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) {
  const ks = p.split(".");
  let cur = o;
  ks.slice(0, -1).forEach((k) => { if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {}; cur = cur[k]; });
  cur[ks.at(-1)] = v;
}

function status(id, text, cls = "ok") { $(id).className = `status ${cls}`; $(id).textContent = text; }

function updateProviderUI() {
  const p = $("provider").value;
  $("baseUrlRow").hidden = p !== "openai_compatible";
  $("model").placeholder = `Default: ${DEFAULT_MODELS[p]}`;
  $("apiKey").placeholder = p === "openai_compatible" ? "Optional for local servers" : "Paste your key";
}

function renderProfile(profile) {
  $("profile").value = profile ? JSON.stringify(profile, null, 2) : "";
  document.querySelectorAll("[data-path]").forEach((el) => {
    const v = profile ? getPath(profile, el.dataset.path) : null;
    el.value = v == null ? "" : v === true ? "Yes" : v === false ? "No" : String(v);
  });
}

function showFileInfo() {
  $("resumeFileInfo").textContent = resumeFile ? `Saved: ${resumeFile.name} (${Math.round(resumeFile.size / 1024)} KB)` : "No file saved.";
}

async function load() {
  const s = await chrome.storage.local.get(["provider", "apiKey", "model", "baseUrl", "profile", "resumeText", "notes", "resumeFile", "overwrite", "coverLetterTemplate", "coverLetterDraft", "autoCoverLetter", "preciseDropdowns", "autoNextPage"]);
  $("provider").value = s.provider || "openai";
  $("apiKey").value = s.apiKey || "";
  $("model").value = s.model || "";
  $("baseUrl").value = s.baseUrl || "";
  $("resumeText").value = s.resumeText || "";
  $("notes").value = s.notes || "";
  $("overwrite").checked = !!s.overwrite;
  $("autoCoverLetter").checked = s.autoCoverLetter !== false;
  $("preciseDropdowns").checked = s.preciseDropdowns !== false;
  $("autoNextPage").checked = s.autoNextPage !== false;
  resumeFile = s.resumeFile || null;
  showFileInfo();
  $("coverLetterTemplate").value = s.coverLetterTemplate || DEFAULT_COVER_TEMPLATE;
  coverDraft = s.coverLetterDraft || null;
  $("coverLetterDraft").value = coverDraft?.text || "";
  $("coverJob").textContent = coverDraft?.url || "";
  renderProfile(s.profile);
  updateProviderUI();
}

// Gather all settings from the page. Throws if the profile JSON is invalid.
function gather() {
  let profile = null;
  const raw = $("profile").value.trim();
  if (raw) {
    try { profile = JSON.parse(raw); } catch (e) { throw new Error(`Profile JSON is invalid: ${e.message}`); }
  }
  const quick = [...document.querySelectorAll("[data-path]")];
  if (!profile && quick.some((el) => el.value.trim())) profile = {};
  if (profile) quick.forEach((el) => {
    const v = el.value.trim();
    setPath(profile, el.dataset.path, v === "" ? null : v === "Yes" && el.tagName === "SELECT" ? true : v === "No" && el.tagName === "SELECT" ? false : v);
  });
  return {
    provider: $("provider").value,
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim(),
    baseUrl: $("baseUrl").value.trim(),
    resumeText: $("resumeText").value,
    notes: $("notes").value,
    overwrite: $("overwrite").checked,
    autoCoverLetter: $("autoCoverLetter").checked,
    preciseDropdowns: $("preciseDropdowns").checked,
    autoNextPage: $("autoNextPage").checked,
    resumeFile,
    coverLetterTemplate: $("coverLetterTemplate").value,
    coverLetterDraft: coverDraft ? { ...coverDraft, text: $("coverLetterDraft").value } : null,
    profile
  };
}

async function save(silent) {
  const data = gather();
  await chrome.storage.local.set(data);
  if (!silent) status("saveStatus", "Saved.");
  return data;
}

$("provider").onchange = updateProviderUI;
$("profile").addEventListener("input", () => {
  try { renderProfile(JSON.parse($("profile").value)); } catch (_) { /* Allow incomplete edits. */ }
});

$("resumeFile").onchange = () => {
  const f = $("resumeFile").files[0];
  if (!f) return;
  if (f.size > 8 * 1024 * 1024) { status("parseStatus", "File is over 8 MB.", "err"); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    resumeFile = { name: f.name, type: f.type || "application/pdf", size: f.size, dataUrl: reader.result };
    showFileInfo();
    await chrome.storage.local.set({ resumeFile });
  };
  reader.readAsDataURL(f);
};

$("save").onclick = () => save().catch((e) => status("saveStatus", e.message, "err"));

function request(msg, timeoutMs = 55000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Extension did not respond. Reload LatentFill in chrome://extensions and try again.")), timeoutMs);
    chrome.runtime.sendMessage(msg, (r) => {
      clearTimeout(timer);
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message));
      if (!r?.ok) return reject(new Error(r?.error || "No response from extension."));
      resolve(r.result);
    });
  });
}
$("testKey").onclick = async () => {
  $("testKey").disabled = true;
  status("keyStatus", "Testing...", "");
  try { await save(true); await request({ type: "TEST_KEY" }); status("keyStatus", "Connected."); }
  catch (e) { status("keyStatus", e.message, "err"); }
  finally { $("testKey").disabled = false; }
};
$("parse").onclick = async () => {
  $("parse").disabled = true;
  status("parseStatus", "Reading your resume...", "");
  try {
    await save(true);
    const result = await request({ type: "PARSE_RESUME" });
    if (result.resumeText) $("resumeText").value = result.resumeText;
    renderProfile(result.profile);
    status("parseStatus", "Done. Review your profile and standard answers.");
  } catch (e) { status("parseStatus", e.message, "err"); }
  finally { $("parse").disabled = false; }
};
$("generateCoverLetter").onclick = async () => {
  $("generateCoverLetter").disabled = true;
  status("coverStatus", "Writing...", "");
  try {
    await save(true);
    const tabs = (await chrome.tabs.query({ currentWindow: true })).filter(t => /^https?:/.test(t.url || ""));
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    if (!tabs.length) throw new Error("Open a job application tab first.");
    const tab = tabs[0];
    if (!confirm("Generate a cover letter for " + tab.title + "?")) return;
    coverDraft = await request({ type: "GENERATE_COVER_LETTER", tabId: tab.id });
    $("coverLetterDraft").value = coverDraft.text;
    $("coverJob").textContent = coverDraft.url;
    status("coverStatus", "Review and edit the letter, then Save settings. It is not saved for autofill yet.");
  } catch (e) { status("coverStatus", e.message, "err"); }
  finally { $("generateCoverLetter").disabled = false; }
};
$("downloadCoverLetter").onclick = () => {
  try {
    const text = $("coverLetterDraft").value.trim();
    if (!text) throw new Error("Generate a letter first.");
    const f = coverLetterPDF(text, gather().profile);
    const a = Object.assign(document.createElement("a"), { href: f.dataUrl, download: f.name }); a.click();
  } catch (e) { status("coverStatus", e.message, "err"); }
};

// ---------- Memory ----------
let mem = { facts: [], answers: [] };
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));

function renderMemory() {
  const q = $("memSearch").value.toLowerCase();
  const match = (...t) => !q || t.join(" ").toLowerCase().includes(q);
  const facts = mem.facts.filter((f) => match(f.text)).slice().reverse();
  $("factList").innerHTML = facts.length
    ? facts.map((f) => `<li><div class="body">${esc(f.text)}<div class="meta">Taught ${esc(f.date)}</div></div><button data-kind="facts" data-id="${f.id}">Forget</button></li>`).join("")
    : `<li class="empty">No facts yet.</li>`;
  const answers = mem.answers.filter((a) => match(a.q, a.a));
  $("answerList").innerHTML = answers.length
    ? answers.map((a) => `<li><div class="body"><div class="q">${esc(a.q)}</div>${esc(a.a)}<div class="meta">${esc(a.date)} · ${esc(a.host || "")}<span class="tag ${a.source === "corrected" ? "c" : ""}">${a.source === "corrected" ? "you corrected" : "you submitted"}</span></div></div><button data-kind="answers" data-id="${a.id}">Forget</button></li>`).join("")
    : `<li class="empty">Nothing learned yet. Fix or submit an autofilled form and it shows up here.</li>`;
}

async function loadMemory() {
  const r = await send({ type: "GET_MEMORY" });
  if (r?.ok) mem = r.result;
  renderMemory();
}

async function persistMemory(msg) {
  const r = await send({ type: "SAVE_MEMORY", memory: mem });
  if (r?.ok) { mem = r.result; renderMemory(); if (msg) status("memStatus", msg); }
  else status("memStatus", r?.error || "Failed.", "err");
}

document.addEventListener("click", (e) => {
  const b = e.target.closest(".mem-list button");
  if (!b) return;
  mem[b.dataset.kind] = mem[b.dataset.kind].filter((x) => x.id !== b.dataset.id);
  persistMemory("Forgotten.");
});

$("addFact").onclick = async () => {
  const text = $("newFact").value.trim();
  if (!text) return;
  const r = await send({ type: "TEACH", text });
  if (r?.ok) { $("newFact").value = ""; status("memStatus", "Remembered."); loadMemory(); }
  else status("memStatus", r?.error || "Failed.", "err");
};
$("newFact").addEventListener("keydown", (e) => { if (e.key === "Enter") $("addFact").click(); });
$("memSearch").oninput = renderMemory;

$("exportMem").onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(mem, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "latentfill-memory.json" });
  a.click();
  URL.revokeObjectURL(url);
};
$("importMem").onclick = () => $("importFile").click();
$("importFile").onchange = async () => {
  try {
    const data = JSON.parse(await $("importFile").files[0].text());
    const ids = new Set([...mem.facts, ...mem.answers].map((x) => x.id));
    mem.facts.push(...(data.facts || []).filter((x) => !ids.has(x.id)));
    mem.answers.push(...(data.answers || []).filter((x) => !ids.has(x.id)));
    persistMemory("Imported.");
  } catch (e) { status("memStatus", "That file isn't a LatentFill memory export.", "err"); }
};
$("clearMem").onclick = () => {
  if (!confirm("Erase everything LatentFill has learned?")) return;
  mem = { facts: [], answers: [] };
  persistMemory("Memory cleared.");
};

load();
loadMemory();
