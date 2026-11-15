const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function showStats(stats) {
  const today = new Date().toISOString().slice(0, 10);
  const runs = stats && stats.day === today ? stats.runs : 0;
  $("stats").textContent = `${runs} today · ${stats?.allTime || 0} all time · no limit · v${chrome.runtime.getManifest().version}`;
}

chrome.storage.local.get(["apiKey", "provider", "profile", "resumeText", "stats"], (s) => {
  showStats(s.stats);
  const missing = [];
  if (!s.apiKey && s.provider !== "openai_compatible") missing.push("an API key");
  if (!s.profile && !s.resumeText) missing.push("your resume");
  if (missing.length) {
    $("setupHint").innerHTML = `Add ${missing.join(" and ")} in <a id="setupLink">Settings</a> to get started.`;
    $("setupLink").onclick = () => chrome.runtime.openOptionsPage();
  }
});

$("settings").onclick = () => chrome.runtime.openOptionsPage();

$("run").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("run").disabled = true;
  $("run").textContent = "Reading form and filling...";
  $("status").className = "status";
  $("status").textContent = "";
  $("details").innerHTML = "";
  chrome.runtime.sendMessage({ type: "RUN_AUTOFILL", tabId: tab.id }, (resp) => {
    $("run").disabled = false;
    $("run").textContent = "Autofill this page";
    if (!resp || !resp.ok) {
      $("status").className = "status err";
      $("status").textContent = resp?.error || chrome.runtime.lastError?.message || "Something went wrong.";
      return;
    }
    const r = resp.result;
    if (r.message) { $("status").className = "status warn"; $("status").textContent = r.message; return; }
    $("status").className = "status ok";
    $("status").textContent = `Filled ${r.filled} of ${r.total} fields. Review before submitting.`;
    const items = [...new Set([...r.review, ...r.failed, ...(r.note ? [r.note] : [])])].filter(Boolean);
    if (items.length) $("details").innerHTML = `<div class="status warn">Needs your attention:</div><ul>${items.map((t) => `<li>${esc(t.slice(0, 220))}</li>`).join("")}</ul>`;
    if (r.stats) showStats(r.stats);
  });
};

function showMemCount() {
  chrome.runtime.sendMessage({ type: "GET_MEMORY" }, (r) => {
    if (!r?.ok) return;
    $("memCount").textContent = `Memory: ${r.result.facts.length} fact${r.result.facts.length === 1 ? "" : "s"}, ${r.result.answers.length} learned answer${r.result.answers.length === 1 ? "" : "s"}. It also learns from your edits.`;
  });
}
showMemCount();

$("teachBtn").onclick = () => {
  const text = $("teach").value.trim();
  if (!text) return;
  chrome.runtime.sendMessage({ type: "TEACH", text }, (r) => {
    $("teachStatus").className = r?.ok ? "status ok" : "status err";
    $("teachStatus").textContent = r?.ok ? " Remembered." : r?.error || "Failed.";
    if (r?.ok) { $("teach").value = ""; showMemCount(); }
  });
};
