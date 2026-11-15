// LatentFill content script: finds form fields on the page and fills them.
// Injected into every frame by background.js. Exposes window.__latentfillCollect / __latentfillFill.
(() => {
  // Re-inject whenever the extension version changes, so a tab left open across an update
  // never keeps running the old fill code.
  const LF_VERSION = (() => { try { return chrome.runtime.getManifest().version; } catch (_) { return "0"; } })();
  if (window.__latentfillLoaded === LF_VERSION) return;
  window.__latentfillLoaded = LF_VERSION;
  window.__latentfillState = null;

  const SKIP_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "password", "search", "range", "color"]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (t, max = 300) => (t || "").replace(/SVGs? (are )?not supported by this browser\.?/gi, " ").replace(/\s+/g, " ").trim().slice(0, max);
  const norm = (t) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (r.width > 0 || r.height > 0) && s.visibility !== "hidden" && s.display !== "none";
  }

  // Text of a node with any form controls' text stripped out.
  function textWithoutControls(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    clone.querySelectorAll("input, select, textarea, option, script, style, [role=listbox]").forEach((n) => n.remove());
    return clean(clone.innerText || clone.textContent || "");
  }

  function textBetween(node, el, controls) {
    const FOLLOW = Node.DOCUMENT_POSITION_FOLLOWING;
    const prev = [...controls].filter((c) => c !== el && !c.contains(el) && !el.contains(c) && (c.compareDocumentPosition(el) & FOLLOW)).pop();
    const out = [];
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (!(t.compareDocumentPosition(el) & FOLLOW)) break;
      if (prev && !(prev.compareDocumentPosition(t) & FOLLOW)) continue;
      const pe = t.parentElement;
      if (!pe || pe.closest("script,style,option,select,[role=listbox]")) continue;
      if (prev && prev.contains(t)) continue;
      if (!pe.getClientRects().length || getComputedStyle(pe).visibility === "hidden") continue;
      const v = t.nodeValue.trim();
      if (v) out.push(v);
    }
    const txt = clean(out.join(" "));
    return txt.length > 200 ? clean(txt.slice(-200)) : txt;
  }

  function textById(ids) {
    return clean(
      (ids || "")
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((n) => n.innerText || n.textContent)
        .join(" ")
    );
  }

  // Best-effort human label for a single control.
  function getLabel(el) {
    const parts = [];
    const lb = el.getAttribute("aria-labelledby");
    if (lb) parts.push(textById(lb));
    if (el.id) {
      try {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) parts.push(textWithoutControls(l));
      } catch (_) {}
    }
    if (!parts.join("")) {
      const wrap = el.closest("label");
      if (wrap) parts.push(textWithoutControls(wrap));
    }
    const aria = el.getAttribute("aria-label");
    // Ignore placeholder-ish aria labels ("file-input", "textbox", "Select...") so we look for the real label.
    if (aria && !/^(file[-_ ]?input|file|upload|textbox|text|input|search|combobox|edit|select|choose)\W*$/i.test(aria.trim())) parts.push(clean(aria));
    if (!parts.join("")) {
      // Walk up to find a container with a label-ish element or short text.
      let node = el.parentElement;
      for (let i = 0; i < 5 && node && node !== document.body; i++, node = node.parentElement) {
        const controls = node.querySelectorAll("input:not([type=hidden]), select, textarea");
        if (controls.length > 1) {
          // Shared container: only use the text sitting between the previous control and this one.
          const t = textBetween(node, el, controls);
          if (t) { parts.push(t); break; }
          if (controls.length > 3) break;
          continue;
        }
        const labelish = node.querySelector("label, legend, [class*='label' i], [class*='question' i], [data-automation-id*='label' i]");
        const t = labelish && !labelish.contains(el) ? textWithoutControls(labelish) : "";
        if (t) { parts.push(t); break; }
        const own = textWithoutControls(node);
        if (own && own.length < 200) { parts.push(own); break; }
      }
    }
    if (!parts.join("")) {
      // No visible label: use the nearest meaningful test id (e.g. "phone_number-code").
      for (let node = el.parentElement, i = 0; node && node !== document.body && i < 7; node = node.parentElement, i++) {
        const tid = node.getAttribute("data-testid") || node.getAttribute("data-automation-id") || "";
        if (tid && /[a-z]{3}/i.test(tid) && !/^(field|select|input|container|wrapper|screen-reader|menu)/i.test(tid)) { parts.push(`[field: ${clean(tid.replace(/[-_]+/g, " "), 60)}]`); break; }
      }
    }
    const ph = el.getAttribute("placeholder");
    if (ph) parts.push(`(placeholder: ${clean(ph)})`);
    const nm = el.getAttribute("name") || el.id;
    if (nm && !/^[a-f0-9-]{16,}$/i.test(nm)) parts.push(`[name: ${clean(nm, 80)}]`);
    return clean([...new Set(parts.filter(Boolean))].join(" "), 400);
  }

  // Label for one radio/checkbox option.
  function optionLabel(el) {
    if (el.tagName !== "INPUT") return clean(el.getAttribute("aria-label") || el.innerText || el.textContent, 150);
    if (el.id) {
      try {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) return textWithoutControls(l);
      } catch (_) {}
    }
    const wrap = el.closest("label");
    if (wrap) return textWithoutControls(wrap);
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria);
    const sib = el.nextElementSibling || el.parentElement?.nextElementSibling;
    if (sib) { const t = textWithoutControls(sib); if (t) return t; }
    return clean(el.value);
  }

  // Question text for a group of radios/checkboxes.
  function groupLabel(els) {
    const fs = els[0].closest("fieldset");
    if (fs) {
      const lg = fs.querySelector("legend");
      if (lg) return textWithoutControls(lg);
    }
    const rg = els[0].closest("[role=radiogroup], [role=group]");
    if (rg) {
      const t = rg.getAttribute("aria-label") || textById(rg.getAttribute("aria-labelledby"));
      if (t) return clean(t);
    }
    // Nearest ancestor containing every option.
    let node = els[0].parentElement;
    while (node && node !== document.body && !els.every((e) => node.contains(e))) node = node.parentElement;
    const optionTexts = new Set(els.map(optionLabel));
    for (let i = 0; i < 4 && node && node !== document.body; i++, node = node.parentElement) {
      const labelish = [...node.querySelectorAll("label, legend, [class*='label' i], [class*='question' i], h3, h4, p, span, div")]
        .find((n) => !n.querySelector("input") && textWithoutControls(n) && !optionTexts.has(textWithoutControls(n)));
      if (labelish) return textWithoutControls(labelish);
    }
    return clean(els[0].name || "");
  }

  function isRequired(el, label) {
    return el.required || el.getAttribute("aria-required") === "true" || /\*\s*$|\*\s*\(|required/i.test(label || "");
  }

  function isCombobox(el) {
    return (
      el.getAttribute("role") === "combobox" ||
      el.getAttribute("aria-autocomplete") === "list" ||
      el.getAttribute("aria-haspopup") === "listbox" ||
      !!el.closest("[class*='select__control'], [data-automation-id='multiselectInputContainer']")
    );
  }

  // ---------- Custom dropdowns (react-select, Workday, ARIA comboboxes) ----------
  // Many ATS dropdowns ignore synthetic events, so we ask the background worker to send
  // real (trusted) keystrokes. Falls back to the component's own React API, then to synthetic events.
  let trustedAvailable = null;
  async function trusted(actions) {
    if (trustedAvailable === false) return false;
    try {
      const r = await chrome.runtime.sendMessage({ type: "TRUSTED_INPUT", actions });
      trustedAvailable = !!(r && r.ok && r.result);
    } catch (_) { trustedAvailable = false; }
    return trustedAvailable;
  }

  const LISTBOX_SEL = "[role=listbox], [class*='menu-list'], [class*='__menu'], [data-automation-id='activeListContainer']";
  const OPTION_SEL = "[role=option], [class*='__option'], [data-automation-id='promptOption']";

  function visibleListboxes() {
    return new Set([...document.querySelectorAll(LISTBOX_SEL)].filter(isVisible));
  }

  function componentRoot(el) {
    const explicit = el.closest(".select-shell, [data-automation-id*='multiselect'], [data-automation-id*='selectWidget']");
    if (explicit) return explicit;
    // react-select style: the container that wraps the control (not the input/value sub-containers).
    const ctl = el.closest("[class*='__control'], [class*='-control']");
    const NOT_SUB = ":not([class*='input-container']):not([class*='value-container']):not([class*='indicators'])";
    const box = (ctl || el).closest(`[class*='__container']${NOT_SUB}, [class$='-container']${NOT_SUB}, [class*='-container ']${NOT_SUB}`);
    if (box && box !== el) return box;
    if (ctl?.parentElement) return ctl.parentElement;
    // Plain ARIA combobox: the closest wrapper that holds only this one control (never the form/body).
    let root = el.parentElement;
    for (let p = el.parentElement, i = 0; p && i < 3 && p !== document.body && p.tagName !== "FORM"; p = p.parentElement, i++) {
      if (p.querySelectorAll("input:not([type=hidden]):not([aria-hidden='true']), select, textarea").length > 1) break;
      root = p;
    }
    return root;
  }

  function isReactSelectLike(el) {
    const root = componentRoot(el);
    return !!(root && root.querySelector("[class*='select__control'], [class*='-control'], [class*='placeholder'], [class*='value-container']"));
  }

  // The listbox that belongs to THIS dropdown (never a random one elsewhere on the page).
  function listboxFor(el, before) {
    const ids = [el.getAttribute("aria-controls"), el.getAttribute("aria-owns")].filter(Boolean).join(" ").split(/\s+/).filter(Boolean);
    for (const id of ids) { const lb = document.getElementById(id); if (lb && isVisible(lb)) return lb; }
    const ad = el.getAttribute("aria-activedescendant");
    if (ad) { const o = document.getElementById(ad); const lb = o?.closest("[role=listbox]") || o?.parentElement; if (lb && isVisible(lb)) return lb; }
    if (el.id) { const lb = document.getElementById(`react-select-${el.id}-listbox`); if (lb && isVisible(lb)) return lb; }
    const root = componentRoot(el);
    const inner = root && [...root.querySelectorAll(LISTBOX_SEL)].find(isVisible);
    if (inner) return inner;
    // Portaled menu: a listbox that appeared after we opened this dropdown.
    if (before) {
      const fresh = [...visibleListboxes()].filter((l) => !before.has(l) && ![...before].some((b) => b.contains(l)));
      if (fresh.length) {
        const r = el.getBoundingClientRect();
        fresh.sort((a, b) => Math.abs(a.getBoundingClientRect().top - r.bottom) - Math.abs(b.getBoundingClientRect().top - r.bottom));
        return fresh[0];
      }
    }
    return null;
  }

  function optionsIn(lb) {
    if (!lb) return [];
    const all = [...lb.querySelectorAll(OPTION_SEL)];
    const set = new Set(all);
    return all.filter((o) => {
      for (let p = o.parentElement; p && p !== lb; p = p.parentElement) if (set.has(p)) return false; // keep outermost
      return isVisible(o) && o.getAttribute("aria-disabled") !== "true";
    });
  }
  const optText = (o) => clean(o.innerText || o.textContent, 160);

  // Poll until this dropdown's options have loaded and stopped changing.
  async function waitForOptions(el, before, timeout = 2500, previous = null) {
    const t0 = Date.now();
    let last = null, stable = 0;
    while (Date.now() - t0 < timeout) {
      const lb = listboxFor(el, before);
      const opts = optionsIn(lb);
      const sig = opts.map(optText).join("|");
      const loading = lb && /loading|searching/i.test(clean(lb.innerText, 80)) && !opts.length;
      if (opts.length && !loading && sig !== previous) {
        if (sig === last) { if (++stable >= 2) return opts; } else { last = sig; stable = 0; }
      }
      await sleep(120);
    }
    return optionsIn(listboxFor(el, before));
  }

  function focusedIndex(el, opts) {
    const ad = el.getAttribute("aria-activedescendant");
    if (ad) { const i = opts.findIndex((o) => o.id === ad); if (i >= 0) return i; }
    const i = opts.findIndex((o) => /is-focused|--focused|highlighted|\bactive\b/i.test(o.className || ""));
    if (i >= 0) return i;
    return opts.findIndex((o) => o.getAttribute("data-focused") === "true");
  }

  function selectedText(el) {
    const root = componentRoot(el);
    const sv = root?.querySelector("[class*='single-value'], [class*='singleValue'], [data-automation-id='selectedItem'], [class*='multi-value__label']");
    return clean(sv?.innerText || "", 200);
  }
  function hiddenValue(el) {
    const root = componentRoot(el);
    const h = root?.querySelector("input[aria-hidden='true'], input[type=hidden]");
    return h ? h.value : null;
  }
  const sameText = (a, b) => norm(a) === norm(b) || (norm(a).length > 3 && (norm(a).startsWith(norm(b)) || norm(b).startsWith(norm(a))));

  // A selection only counts if the component itself shows it (not just typed text) and it survives blur.
  // Some components display a short form of the option (e.g. "+1" for "United States +1").
  function confirmed(el, wanted, hiddenBefore, selBefore = "", closedOnPick = false) {
    const sel = selectedText(el);
    if (sel) return sameText(sel, wanted) || (sel !== selBefore && !!norm(sel) && (norm(wanted).includes(norm(sel)) || norm(sel).includes(norm(wanted))));
    const hv = hiddenValue(el);
    if (hv !== null && hv !== "" && hv !== hiddenBefore) return true;
    if (isReactSelectLike(el)) return false;
    // Plain ARIA autocomplete with no value display: accept only exact option text after Enter + blur.
    return closedOnPick && el.getAttribute("aria-expanded") !== "true" && norm(el.value) === norm(wanted) && !!norm(wanted);
  }

  async function closeMenu(el) {
    if (!(await trusted([{ key: "Escape" }]))) el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  async function openMenu(el) {
    el.focus();
    await sleep(60);
    if (await trusted([{ key: "ArrowDown" }])) return true;
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", keyCode: 40, bubbles: true }));
    return false;
  }

  async function probeComboOptions(el) {
    try {
      const before = visibleListboxes();
      await openMenu(el);
      const opts = (await waitForOptions(el, before, 1500)).map(optText).filter(Boolean);
      await closeMenu(el);
      el.blur();
      await sleep(80);
      return [...new Set(opts)].slice(0, 200);
    } catch (_) {
      return [];
    }
  }

  function hasValue(el) {
    if (el.isContentEditable) return !!clean(el.innerText);
    if (el.tagName === "SELECT") return el.selectedIndex > 0 && !!el.value;
    return !!(el.value && el.value.trim());
  }

  function jobContext() {
    const sels = ["[class*='job-description' i]", "[class*='jobdescription' i]", "[data-automation-id='jobPostingDescription']", "#content", "[class*='description' i]", "main", "article"];
    let desc = "";
    for (const s of sels) {
      const n = document.querySelector(s);
      if (n && (n.innerText || "").length > desc.length) desc = n.innerText;
      if (desc.length > 1500) break;
    }
    if (!desc) desc = document.body?.innerText || "";
    const h1 = document.querySelector("h1")?.innerText;
    return { url: location.href, title: clean(document.title, 200), heading: clean(h1, 200), description: clean(desc, 6000) };
  }

  // ---------- Sections (education / work history) ----------
  const EDU_RE = /educat|school|universit|college|degree|academic/i;
  const EXP_RE = /employ|experience|work history|job history|work\b|positions?\b|professional/i;
  const sectionKind = (t) => (EDU_RE.test(t || "") ? "education" : EXP_RE.test(t || "") ? "experience" : null);
  const HEADING_SEL = "h1, h2, h3, h4, h5, legend, [role=heading], [class*='section-title' i], [class*='sectionTitle' i], [class*='section-header' i], [class*='sectionHeader' i], [data-automation-id*='Header' i]";
  function nearestHeading(el) {
    for (let node = el.parentElement, i = 0; node && node !== document.body && i < 10; node = node.parentElement, i++) {
      const hs = [...node.querySelectorAll(HEADING_SEL)].filter((h) => !h.contains(el) && (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && clean(h.innerText));
      if (hs.length) return clean(hs[hs.length - 1].innerText, 80);
    }
    return "";
  }
  const isOn = (b) => b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-checked") === "true" || b.getAttribute("aria-selected") === "true" || /\b(selected|active|checked|is-?selected)\b/i.test(b.className || "");
  const entryFieldRe = (kind) => (kind === "education" ? /\b(school|institution|universit\w*|college)\b/i : /\b(company|employer|organi[sz]ation)( name)?\b/i);

  // Which repeatable section (education / experience) an element belongs to: its heading,
  // or the "Add Education"-style button that shares its container (Workable inline forms).
  function kindFor(el) {
    const k = sectionKind(nearestHeading(el));
    if (k) return k;
    for (let node = el.parentElement, i = 0; node && node !== document.body && i < 10; node = node.parentElement, i++) {
      const attr = [node.id, node.getAttribute("data-ui"), node.getAttribute("data-automation-id"), node.getAttribute("data-testid"), node.getAttribute("aria-label")].filter(Boolean).join(" ");
      if (attr && /^(education|experience|employment|work)/i.test(attr)) return /^educ/i.test(attr) ? "education" : "experience";
      const kinds = new Set([...node.querySelectorAll("button, a, [role=button]")].map((b) => {
        const t = clean([b.innerText, b.getAttribute("aria-label")].filter(Boolean).join(" "), 120);
        return /^\+?\s*add\b/i.test(t) ? sectionKind(t) : null;
      }).filter(Boolean));
      if (kinds.size === 1) return [...kinds][0];
      if (kinds.size > 1) return null;
    }
    return null;
  }

  // Inline entry editors (Workable "Update", others "Save"/"Done") need confirming before the
  // entry counts. Click the confirm button of any filled education/experience editor.
  async function commitEntries() {
    const done = [];
    for (const b of [...document.querySelectorAll("button, [role=button]")]) {
      if (!isVisible(b) || b.disabled) continue;
      const t = clean(b.innerText || b.getAttribute("aria-label") || "", 40);
      if (!/^(update|save|done|confirm|save (entry|education|experience)|ok)$/i.test(t)) continue;
      const kind = kindFor(b);
      if (!kind) continue;
      // The editor: the smallest ancestor holding an entry field with a value.
      let box = b.parentElement, ok = false;
      for (let i = 0; i < 5 && box && box !== document.body; i++, box = box.parentElement) {
        const ins = [...box.querySelectorAll("input:not([type=hidden]):not([type=file]), textarea")].filter(isVisible);
        if (ins.some((e) => entryFieldRe(kind).test(getLabel(e)))) { ok = ins.some((e) => e.value); break; }
      }
      if (!ok) continue;
      b.click();
      done.push(kind);
      await sleep(800);
    }
    return { committed: done };
  }

  function adders() {
    return [...document.querySelectorAll("button, a, [role=button]")].filter(isVisible).map((b) => {
      const t = clean([b.innerText, b.getAttribute("aria-label"), b.getAttribute("title")].filter(Boolean).join(" "), 120);
      if (!/^\+?\s*add\b/i.test(t) || t.length > 100) return null;
      if (/file|resume|cv\b|cover|attach|link|website|url|social|question|skill|language|certif|reference/i.test(t)) return null;
      const kind = sectionKind(t) || sectionKind(nearestHeading(b));
      return kind ? { b, kind, text: t } : null;
    }).filter(Boolean);
  }
  function sectionBox(b, kind) {
    let node = b.parentElement;
    for (let i = 0; i < 7 && node && node !== document.body; i++, node = node.parentElement) {
      const h = [...node.querySelectorAll(HEADING_SEL)].some((x) => sectionKind(x.innerText) === kind);
      if (h || entryCountIn(node, kind) > 0) return node;
    }
    return b.parentElement;
  }
  function entryCountIn(root, kind) {
    const re = entryFieldRe(kind);
    return [...root.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea")]
      .filter((e) => isVisible(e) && re.test(getLabel(e).replace(/\[name:[^\]]*\]|\(placeholder:[^)]*\)/gi, "")) && !/current company|company (name )?you.*(applying|work)/i.test(getLabel(e))).length;
  }
  // Click "Add another" / "Add education" / "Add work experience" until the form has one entry
  // per item on the resume, and open collapsed education/experience sections.
  async function expand(counts = {}) {
    let clicks = 0;
    for (const t of document.querySelectorAll("button[aria-expanded='false'], [role=button][aria-expanded='false']")) {
      if (isVisible(t) && sectionKind(clean(t.innerText, 80)) && !/^\+?\s*add\b/i.test(clean(t.innerText))) { t.click(); clicks++; await sleep(300); }
    }
    for (const kind of ["education", "experience"]) {
      const want = Math.min(Number(counts[kind]) || 0, 6);
      if (!want) continue;
      for (let guard = 0; guard < 8; guard++) {
        const a = adders().find((x) => x.kind === kind);
        if (!a) break;
        const box = sectionBox(a.b, kind);
        const have = entryCountIn(box, kind);
        if (have >= want) break;
        a.b.click();
        clicks++;
        await sleep(700);
        const after = entryCountIn(sectionBox(adders().find((x) => x.kind === kind)?.b || a.b, kind), kind);
        if (after <= have) break; // button didn't add an entry; don't keep clicking
      }
    }
    if (clicks) await sleep(400);
    return { clicks, hasAdders: adders().length > 0 };
  }

  // ---------- Collect ----------
  async function collect(opts = {}) {
    // Never touch CAPTCHA / bot-check frames.
    if (/captcha|hcaptcha|recaptcha|challenges\.cloudflare|turnstile|arkoselabs|funcaptcha/i.test(location.hostname + location.pathname)) return { fields: [], job: { url: location.href } };
    const overwrite = !!opts.overwrite;
    const state = { map: new Map() };
    window.__latentfillState = state;
    const fields = [];
    const seen = new Set();
    let n = 0;
    const add = (field, target, extra = {}) => {
      const id = `f${n++}`;
      state.map.set(id, { ...field, target, ...extra });
      fields.push({ id, ...field });
      return id;
    };

    const radioGroups = new Map();
    const checkGroups = new Map();
    const els = document.querySelectorAll("input, textarea, select, [contenteditable='true'], [role='combobox']");

    for (const el of els) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.disabled || el.readOnly || el.closest("[aria-hidden='true']")) continue;
      const tag = el.tagName;
      const type = (el.getAttribute("type") || "text").toLowerCase();

      if (tag === "INPUT" && type === "radio") {
        const key = el.name || `__noname_${el.closest("fieldset, [role=radiogroup], div")?.className || n}`;
        if (!radioGroups.has(key)) radioGroups.set(key, []);
        radioGroups.get(key).push(el);
        continue;
      }
      if (tag === "INPUT" && type === "checkbox") {
        // Hidden checkbox behind a Yes/No button group (Ashby): the buttons are handled below.
        if (el.parentElement?.querySelector("button[aria-pressed], [role=radio]:not(input)")) continue;
        const key = el.name || `__single_${n++}`;
        if (!checkGroups.has(key)) checkGroups.set(key, []);
        checkGroups.get(key).push(el);
        continue;
      }
      if (tag === "INPUT" && type === "file") {
        const label = getLabel(el);
        add({ type: "file", label, required: isRequired(el, label) }, el);
        continue;
      }
      if (tag === "INPUT" && SKIP_INPUT_TYPES.has(type)) continue;
      if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && !el.isContentEditable && el.getAttribute("role") !== "combobox") continue;
      // Combobox wrappers that aren't inputs: use their inner input if present.
      if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && !el.isContentEditable) {
        const inner = el.querySelector("input:not([type=hidden])");
        if (inner) { seen.add(inner); continue; }
        // Click-to-open dropdown with no text input (Rippling, many design systems).
        await addButtonSelect(el);
        continue;
      }
      if (!isVisible(el)) continue;
      if (!overwrite && hasValue(el) && !isCombobox(el)) continue;

      const label = getLabel(el);
      const required = isRequired(el, label);
      if (tag === "SELECT") {
        const options = [...el.options].map((o) => clean(o.text, 120)).filter(Boolean);
        add({ type: "select", label, required, options }, el);
      } else if (tag === "TEXTAREA" || el.isContentEditable) {
        add({ type: "textarea", label, required, maxLength: el.maxLength > 0 ? el.maxLength : undefined }, el);
      } else if (isCombobox(el)) {
        // Skip comboboxes that already show a selected value (react-select single-value).
        if (!overwrite && selectedText(el)) continue;
        const options = opts.noProbe ? [] : await probeComboOptions(el);
        add({ type: "combobox", label, required, options: options.length ? options : undefined }, el);
      } else {
        add({ type: "text", inputType: type, label, required, maxLength: el.maxLength > 0 ? el.maxLength : undefined }, el);
      }
    }

    const popBtns = [...document.querySelectorAll("button[aria-haspopup='listbox'], [role=button][aria-haspopup='listbox']")];
    for (const b of document.querySelectorAll("button[aria-haspopup='true'], button[aria-haspopup='menu']")) {
      // Design-system selects (BambooHR Fabric) render a button over a hidden <select>.
      for (let p = b.parentElement, i = 0; p && i < 5 && p !== document.body; p = p.parentElement, i++) {
        if (p.querySelectorAll("button[aria-haspopup]").length > 1) break;
        if (p.querySelector("select[aria-hidden='true'], select[tabindex='-1']")) { popBtns.push(b); break; }
      }
    }
    for (const b of popBtns) {
      if (seen.has(b)) continue;
      seen.add(b);
      if (b.closest("[role=combobox]") || b.closest("[class*='select__control']") || b.querySelector("input")) continue;
      await addButtonSelect(b);
    }

    for (const [, group] of radioGroups) {
      if (!overwrite && group.some((r) => r.checked)) continue;
      const label = groupLabel(group);
      add({ type: "radio", label, required: group.some((g) => isRequired(g, label)), options: group.map(optionLabel) }, group);
    }
    // Button-style choices (Ashby Yes/No, custom radio cards) behave like radio groups.
    const btnGroups = new Map();
    for (const b of document.querySelectorAll("button[aria-pressed], [role=radio]:not(input)")) {
      if (!isVisible(b) || b.closest("[aria-hidden='true']") || b.disabled) continue;
      const p = b.closest("[role=radiogroup]") || b.parentElement;
      if (!btnGroups.has(p)) btnGroups.set(p, []);
      btnGroups.get(p).push(b);
    }
    for (const [box, group] of btnGroups) {
      if (group.length < 2 || group.length > 12) continue;
      if (!overwrite && group.some(isOn)) continue;
      const label = groupLabel(group);
      const entry = box.closest("[class*='field' i], [class*='question' i], fieldset");
      const required = /\*\s*$/.test(label) || !!entry?.querySelector("[class*='required' i]") || box.getAttribute("aria-required") === "true";
      add({ type: "radio", label, required, options: group.map(optionLabel) }, group);
    }
    for (const [, group] of checkGroups) {
      if (group.length === 1) {
        const el = group[0];
        if (!overwrite && el.checked) continue;
        const label = optionLabel(el) || getLabel(el);
        add({ type: "checkbox", label, required: isRequired(el, label) }, el);
      } else {
        const label = groupLabel(group);
        add({ type: "checkbox_group", label, required: false, options: group.map(optionLabel) }, group);
      }
    }

    async function addButtonSelect(el) {
      if (!isVisible(el) || el.getAttribute("aria-disabled") === "true" || el.disabled) return;
      const label = getLabel(el);
      const shown = buttonSelectText(el);
      if (!overwrite && shown && !PLACEHOLDER_RE.test(shown)) return;
      const options = opts.noProbe ? [] : (await probeButtonSelect(el)).filter((o) => !PLACEHOLDER_RE.test(o));
      add({ type: "select", label: cleanSelectLabel(label), required: isRequired(el, label) || el.getAttribute("aria-required") === "true", options: options.length ? options : undefined }, el, { custom: true });
    }

    // Tell the AI which section and entry each field belongs to (Education #2, Work history #1...).
    const seenKeys = new Map();
    for (const f of fields) {
      const t = state.map.get(f.id).target;
      const el = Array.isArray(t) ? t[0] : t;
      const heading = nearestHeading(el);
      const kind = sectionKind(heading) || kindFor(el);
      if (!kind) continue;
      f.section = sectionKind(heading) ? heading : (kind === "education" ? "Education" : "Work experience");
      const key = kind + "|" + f.label.replace(/\[name:[^\]]*\]/gi, "").replace(/[-_]\d+\b/g, "").trim();
      const nth = (seenKeys.get(key) || 0) + 1;
      seenKeys.set(key, nth);
      f.entry = nth + (Number(opts.entryOffset?.[kind]) || 0);
    }
    return { fields, job: jobContext() };
  }

  // ---------- Fill helpers ----------
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
  }
  const fire = (el, ...types) => types.forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));

  const US_STATES = { al:"alabama",ak:"alaska",az:"arizona",ar:"arkansas",ca:"california",co:"colorado",ct:"connecticut",de:"delaware",fl:"florida",ga:"georgia",hi:"hawaii",id:"idaho",il:"illinois",in:"indiana",ia:"iowa",ks:"kansas",ky:"kentucky",la:"louisiana",me:"maine",md:"maryland",ma:"massachusetts",mi:"michigan",mn:"minnesota",ms:"mississippi",mo:"missouri",mt:"montana",ne:"nebraska",nv:"nevada",nh:"new hampshire",nj:"new jersey",nm:"new mexico",ny:"new york",nc:"north carolina",nd:"north dakota",oh:"ohio",ok:"oklahoma",or:"oregon",pa:"pennsylvania",ri:"rhode island",sc:"south carolina",sd:"south dakota",tn:"tennessee",tx:"texas",ut:"utah",vt:"vermont",va:"virginia",wa:"washington",wv:"west virginia",wi:"wisconsin",wy:"wyoming",dc:"district of columbia",us:"united states",usa:"united states" };
  const segs = (t) => String(t ?? "").split(",").map((x) => { const n = norm(x); return US_STATES[n] || n; }).filter(Boolean);
  // "Pittsburgh, PA" vs "Pittsburgh, Pennsylvania, United States": first segment must match exactly.
  function segmentScore(option, value) {
    const a = segs(value), b = segs(option);
    if (a.length < 2 || !b.length || a[0] !== b[0]) return 0;
    let s = 60;
    for (const x of a.slice(1)) if (b.slice(1).includes(x)) s += 15;
    return s - Math.max(0, b.length - a.length);
  }

  function bestMatch(options, value) {
    const v = norm(value);
    if (!v) return -1;
    let best = -1, bestScore = 0;
    const vTokens = new Set(v.split(" "));
    options.forEach((o, i) => {
      const t = norm(o);
      if (!t) return;
      let s = 0;
      const T = ` ${t} `, V = ` ${v} `;
      if (t === v) s = 100;
      else if (T.startsWith(V) || V.startsWith(T)) s = 70 + 10 * (Math.min(t.length, v.length) / Math.max(t.length, v.length));
      else if (T.includes(V) || V.includes(T)) s = 55 + 10 * (Math.min(t.length, v.length) / Math.max(t.length, v.length));
      else {
        const tt = new Set(t.split(" "));
        const inter = [...vTokens].filter((x) => tt.has(x)).length;
        s = (inter / new Set([...vTokens, ...tt]).size) * 50;
      }
      s = Math.max(s, segmentScore(o, value));
      if (s > bestScore) { bestScore = s; best = i; }
    });
    return bestScore >= 25 ? best : -1;
  }

  function toText(v) {
    if (v === true) return "Yes";
    if (v === false) return "No";
    if (Array.isArray(v)) return v.join(", ");
    return String(v);
  }

  function mark(el, ok) {
    const t = el instanceof Element ? el : null;
    if (!t) return;
    const box = t.type === "radio" || t.type === "checkbox" || t.type === "file" ? (t.closest("label") || t.parentElement || t) : t;
    box.style.outline = ok ? "2px solid #16a34a" : "2px solid #f59e0b";
    box.style.outlineOffset = "2px";
  }

  function fillText(el, value) {
    const v = toText(value);
    el.focus();
    if (el.isContentEditable) {
      el.innerText = "";
      document.execCommand("insertText", false, v);
    } else {
      setNativeValue(el, v);
      fire(el, "input", "change");
    }
    el.blur();
    return true;
  }

  function fillSelect(el, value) {
    const opts = [...el.options];
    let i = bestMatch(opts.map((o) => o.text), toText(value));
    if (i < 0) i = bestMatch(opts.map((o) => o.value), toText(value));
    if (i < 0) return false;
    el.focus();
    setNativeValue(el, opts[i].value);
    fire(el, "input", "change");
    el.blur();
    return true;
  }

  // ---------- Click-to-open dropdowns (div[role=combobox], button[aria-haspopup=listbox]) ----------
  const PLACEHOLDER_RE = /^\s*$|^[-–—]+$|^[-–—]\s*(select|choose)\s*[-–—]$|^(please )?(select|choose|pick)( an?| one| your)?( option| answer| value)?\s*(\.{2,3}|…)?$|^(select|choose)\b.{0,40}(\.{3}|…)$/i;
  const cleanSelectLabel = (l) => clean(String(l).replace(/^select\.{0,3}\s*/i, ""), 400) || l;
  function buttonSelectText(el) {
    const v = el.querySelector("[class*='single-value' i], [class*='singleValue' i], [class*='selected' i], [class*='value' i]:not([class*='container' i])");
    return clean((v && v.innerText) || el.innerText || el.textContent || "", 160);
  }
  const MENU_SEL = LISTBOX_SEL + ", [role=menu]";
  const MENU_OPT_SEL = OPTION_SEL + ", [role=menuitem], [role=menuitemradio]";
  function buttonMenu(el, before) {
    const id = el.getAttribute("data-menu-id") || el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    if (id) { const m = document.getElementById(id.split(/\s+/)[0]); if (m && isVisible(m)) return m; }
    const lb = listboxFor(el, before);
    if (lb) return lb;
    const fresh = [...document.querySelectorAll("[role=menu]")].filter((m) => isVisible(m) && !before.has(m));
    return fresh[0] || null;
  }
  function buttonOptions(m) {
    if (!m) return [];
    let all = [...m.querySelectorAll(MENU_OPT_SEL)];
    // aria-owns menus keep their items elsewhere in the DOM
    if (!all.length && m.getAttribute("aria-owns")) all = m.getAttribute("aria-owns").split(/\s+/).map((i) => document.getElementById(i)).filter(Boolean);
    const set = new Set(all);
    return all.filter((o) => { for (let p = o.parentElement; p && p !== m; p = p.parentElement) if (set.has(p)) return false; return o.getAttribute("aria-disabled") !== "true"; });
  }
  async function waitButtonOptions(el, before, timeout) {
    const t0 = Date.now(); let last = "", stable = 0, opts = [];
    while (Date.now() - t0 < timeout) {
      opts = buttonOptions(buttonMenu(el, before));
      const sig = opts.map(optText).join("|");
      if (opts.length) { if (sig === last) { if (++stable >= 2) return opts; } else { last = sig; stable = 0; } }
      await sleep(120);
    }
    return opts;
  }
  async function openButtonSelect(el) {
    const before = new Set([...document.querySelectorAll(MENU_SEL)].filter(isVisible));
    el.scrollIntoView({ block: "center" });
    await sleep(60);
    el.focus();
    clickLikeUser(el);
    let opts = await waitButtonOptions(el, before, 1200);
    if (!opts.length && window.top === window) {
      const r = el.getBoundingClientRect();
      if (await trusted([{ click: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }])) opts = await waitButtonOptions(el, before, 1500);
    }
    if (!opts.length && el.getAttribute("aria-expanded") !== "true") {
      el.focus();
      if (await trusted([{ key: "ArrowDown" }])) opts = await waitButtonOptions(el, before, 1200);
    }
    return { before, opts };
  }
  async function probeButtonSelect(el) {
    try {
      const { opts } = await openButtonSelect(el);
      const out = [...new Set(opts.map(optText).filter(Boolean))].slice(0, 200);
      await closeMenu(el);
      if (el.getAttribute("aria-expanded") === "true") clickLikeUser(el);
      el.blur();
      await sleep(100);
      return out;
    } catch (_) { return []; }
  }
  async function fillButtonSelect(el, value) {
    const want = toText(value);
    const { opts } = await openButtonSelect(el);
    if (!opts.length) return { ok: false, reason: "the dropdown didn't open" };
    const i = bestMatch(opts.map(optText), want);
    if (i < 0) { await closeMenu(el); return { ok: false, reason: "no matching option" }; }
    const opt = opts[i], text = optText(opt);
    const good = () => { const t = buttonSelectText(el); return !!t && !PLACEHOLDER_RE.test(t) && (sameText(t, text) || norm(t).includes(norm(text)) || norm(text).includes(norm(t))); };
    opt.scrollIntoView({ block: "nearest" });
    clickLikeUser(opt);
    await sleep(350);
    if (!good() && window.top === window && isVisible(opt)) {
      const r = opt.getBoundingClientRect();
      await trusted([{ click: { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 } }]);
      await sleep(350);
    }
    if (!good()) {
      // Keyboard fallback: reopen, walk to the option, Enter.
      const r = await openButtonSelect(el);
      const j = r.opts.findIndex((o) => optText(o) === text);
      if (j >= 0 && !good()) {
        let cur = focusedIndex(el, r.opts);
        const keys = [];
        if (cur < 0) { keys.push({ key: "ArrowDown" }); cur = 0; }
        for (let k = cur; k < j; k++) keys.push({ key: "ArrowDown" });
        for (let k = cur; k > j; k--) keys.push({ key: "ArrowUp" });
        keys.push({ key: "Enter" });
        if (!(await trusted(keys))) r.opts[j].click();
        await sleep(350);
      }
    }
    if (el.getAttribute("aria-expanded") === "true") await closeMenu(el);
    el.blur();
    await sleep(150);
    return good() ? { ok: true, shown: buttonSelectText(el) } : { ok: false, reason: `picked "${text}" but the site didn't keep it` };
  }

  function clickLikeUser(node) {
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      node.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
  }

  function focusIn(el) {
    if (document.activeElement !== el) el.focus();
    return document.activeElement === el;
  }

  async function typeFilter(el, text) {
    (el._lfTyped || (el._lfTyped = new Set())).add(norm(text));
    if (focusIn(el) && await trusted([{ selectAll: true }, { key: "Backspace" }, { insertText: text }])) return true;
    setNativeValue(el, text);
    fire(el, "input");
    return false;
  }

  async function clearResidue(el) {
    if (!el.value) return;
    if (!focusIn(el) || !(await trusted([{ selectAll: true }, { key: "Backspace" }]))) { setNativeValue(el, ""); fire(el, "input"); }
  }

  // Keyboard path: open, (optionally) filter, arrow to the option, press Enter.
  async function selectViaKeyboard(el, want, hiddenBefore, selBefore) {
    const before = visibleListboxes();
    if (!(await openMenu(el))) return { ok: false, untrusted: true };
    let opts = await waitForOptions(el, before, 2500);
    let i = bestMatch(opts.map(optText), want);
    const queries = [want, want.split(",")[0].trim()].filter((q, k, arr) => q && arr.indexOf(q) === k);
    for (const q of queries) {
      if (i >= 0 && opts.length <= 50) break;
      const prev = opts.map(optText).join("|");
      await typeFilter(el, q);
      opts = await waitForOptions(el, before, 5000, prev);
      if (!opts.length) opts = await waitForOptions(el, before, 1000);
      i = bestMatch(opts.map(optText), want);
    }
    if (i < 0) return { ok: false, reason: opts.length ? `no option matched (saw: ${opts.slice(0, 4).map(optText).join(" / ")})` : "the menu didn't open" };
    const targetText = optText(opts[i]);
    // Arrow to the target option, re-reading after each move (menus re-render).
    for (let step = 0; step < 120; step++) {
      opts = optionsIn(listboxFor(el, before));
      i = opts.findIndex((o) => optText(o) === targetText);
      const cur = focusedIndex(el, opts);
      if (i < 0 || cur < 0 || cur === i) break;
      await trusted([{ key: cur < i ? "ArrowDown" : "ArrowUp" }]);
      await sleep(40);
    }
    opts = optionsIn(listboxFor(el, before));
    i = opts.findIndex((o) => optText(o) === targetText);
    if (i < 0 || focusedIndex(el, opts) !== i) {
      // Can't see focus: filter down to exactly this option so it's the only/first one.
      await typeFilter(el, targetText);
      opts = await waitForOptions(el, before, 3000);
      const j = opts.findIndex((o) => optText(o) === targetText);
      if (j < 0 || (focusedIndex(el, opts) !== j && !(j === 0 && focusedIndex(el, opts) < 0))) return { ok: false };
    }
    const wasOpen = !!listboxFor(el, before);
    await trusted([{ key: "Enter" }]);
    await sleep(250);
    let closedOnPick = wasOpen && !listboxFor(el, before);
    el.blur();
    await sleep(450);
    if (confirmed(el, targetText, hiddenBefore, selBefore, closedOnPick)) return { ok: true, targetText };
    // Some menus ignore Enter: click the option with a real mouse click.
    if (await trustedClickOption(el, before, targetText)) {
      await sleep(300);
      closedOnPick = !listboxFor(el, before);
      el.blur();
      await sleep(400);
      if (confirmed(el, targetText, hiddenBefore, selBefore, closedOnPick) || (closedOnPick && pickedShort(el, targetText))) return { ok: true, targetText };
    }
    return { ok: (closedOnPick && pickedShort(el, targetText)), targetText };
  }

  // Input shows a short form of the picked option ("+255" for "+255 TZ - Tanzania").
  function pickedShort(el, text) {
    if (isReactSelectLike(el) || el.tagName !== "INPUT") return false;
    const v = norm(el.value);
    if (!v || v.length < 2 || v === norm(text) || el._lfTyped?.has(v)) return false;
    return norm(text).startsWith(v);
  }
  async function trustedClickOption(el, before, text) {
    if (window.top !== window) return false; // mouse coordinates are only reliable in the top frame
    if (!listboxFor(el, before)) { await openMenu(el); await waitForOptions(el, before, 1500); }
    let opts = optionsIn(listboxFor(el, before));
    let o = opts.find((x) => optText(x) === text);
    if (!o) { await typeFilter(el, text.split(/\s+-\s+|,/)[0]); opts = await waitForOptions(el, before, 2500); o = opts.find((x) => optText(x) === text); }
    if (!o) return false;
    o.scrollIntoView({ block: "nearest" });
    await sleep(80);
    const r = o.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    return trusted([{ click: { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 } }]);
  }

  // React fallback: call the react-select component's own selectOption() (runs in the page's world).
  async function selectViaReact(el, want) {
    const marker = Math.random().toString(36).slice(2);
    el.setAttribute("data-latentfill-cb", marker);
    try {
      const r = await chrome.runtime.sendMessage({ type: "REACT_SELECT", marker, value: want });
      return r?.ok ? r.result : null;
    } catch (_) { return null; } finally { el.removeAttribute("data-latentfill-cb"); }
  }

  // Last resort for components that accept synthetic events.
  async function selectViaSynthetic(el, want, hiddenBefore, selBefore) {
    const before = visibleListboxes();
    el.focus();
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    setNativeValue(el, want);
    fire(el, "input");
    const opts = await waitForOptions(el, before, 2500);
    const i = bestMatch(opts.map(optText), want);
    if (i < 0) return false;
    const targetText = optText(opts[i]);
    clickLikeUser(opts[i]);
    await sleep(200);
    const closedOnPick = !listboxFor(el, before);
    el.blur();
    await sleep(400);
    return confirmed(el, targetText, hiddenBefore, selBefore, closedOnPick);
  }

  async function fillCombobox(el, value) {
    const want = toText(value);
    const why = (ok, reason) => ({ ok, reason });
    if (selectedText(el) && sameText(selectedText(el), want)) return why(true);
    const hiddenBefore = hiddenValue(el);
    const selBefore = selectedText(el);
    let ok = false, reason = "";
    const kb = await selectViaKeyboard(el, want, hiddenBefore, selBefore).catch((e) => ({ ok: false, err: e.message }));
    ok = kb.ok;
    if (!ok) reason = kb.untrusted ? "real keystrokes unavailable" : kb.reason || (kb.targetText ? `picked "${kb.targetText}" but the site didn't keep it` : "no matching option appeared");
    if (!ok) {
      await closeMenu(el).catch(() => {});
      const r = await selectViaReact(el, kb.targetText || want);
      if (r?.ok) { await sleep(300); el.blur(); await sleep(300); ok = confirmed(el, r.label, hiddenBefore, selBefore); }
    }
    if (!ok && kb.untrusted) ok = await selectViaSynthetic(el, want, hiddenBefore, selBefore).catch(() => false);
    if (!ok) {
      // Don't leave typed text that looks like an answer.
      await clearResidue(el).catch(() => {});
      await closeMenu(el).catch(() => {});
      el.blur();
    }
    return why(ok, reason);
  }

  // After everything is filled, make sure each dropdown still shows what we picked (some forms re-render).
  async function reverify(done) {
    const lost = [];
    for (const d of done) {
      const sel = selectedText(d.el);
      if (sel && d.shown && sel === d.shown) continue;
      if (sel && (sameText(sel, d.want) || norm(d.want).includes(norm(sel)) || norm(sel).includes(norm(d.want)))) continue;
      if (!sel && !isReactSelectLike(d.el) && hiddenValue(d.el) === null && norm(d.el.value) === norm(d.want)) continue;
      const r = await fillCombobox(d.el, d.want).catch(() => ({ ok: false }));
      if (!r.ok) lost.push(d);
    }
    return lost;
  }

  async function fillRadio(group, value) {
    const i = bestMatch(group.map(optionLabel), toText(value));
    if (i < 0) return false;
    const el = group[i];
    if (el.tagName === "INPUT") { if (!el.checked) el.click(); return true; }
    const inner = el.querySelector("input[type=radio], input[type=checkbox]");
    if (!isOn(el)) (inner ? (el.querySelector("label") || inner) : el).click();
    await sleep(200);
    if (isOn(el) || inner?.checked) return true;
    // Some button groups only react to a full pointer sequence.
    clickLikeUser(el);
    await sleep(200);
    return isOn(el) || (!el.hasAttribute("aria-pressed") && !el.hasAttribute("aria-checked"));
  }

  function truthy(v) {
    return v === true || /^(yes|true|y|1|checked|agree)$/i.test(String(v).trim());
  }

  function fillCheckbox(el, value) {
    const want = truthy(value);
    if (el.checked !== want) el.click();
    return true;
  }

  function fillCheckGroup(group, values) {
    const list = Array.isArray(values) ? values : String(values).split(/\s*[,;]\s*/);
    const labels = group.map(optionLabel);
    let any = false;
    for (const v of list) {
      const i = bestMatch(labels, v);
      if (i >= 0) { if (!group[i].checked) group[i].click(); any = true; }
    }
    return any;
  }

  function dataUrlToFile(dataUrl, name, mime) {
    const [, b64] = dataUrl.split(",");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  }

  function fillFile(el, resume) {
    if (!resume?.dataUrl) return false;
    const dt = new DataTransfer();
    dt.items.add(dataUrlToFile(resume.dataUrl, resume.name || "resume.pdf", resume.type || "application/pdf"));
    el.files = dt.files;
    fire(el, "input", "change");
    return true;
  }

  async function settle(minMs = 1200, quietMs = 900, maxMs = 8000) {
    let last = Date.now();
    const mo = new MutationObserver(() => { last = Date.now(); });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      await sleep(150);
      if (Date.now() - t0 >= minMs && Date.now() - last >= quietMs) break;
    }
    mo.disconnect();
  }
  const connected = (t) => (Array.isArray(t) ? t.every((x) => x.isConnected) : !!t?.isConnected);
  function isResumeParser(el) {
    if (el.closest("[class*='autofill' i], [data-testid*='autofill' i], [id*='autofill' i]")) return true;
    let node = el.parentElement;
    for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
      const t = clean(node.innerText || "", 400);
      if (t && t.length < 300 && /auto-?fill|autopopulate|auto-populate|parse your|import (from|your) resume|upload .{0,30} to (auto|fill|populate)/i.test(t)) return true;
    }
    return false;
  }

  // ---------- Next steps: notice when a new page/step of the application appears ----------
  function fieldKey(e) { return (e.name || e.id || "") + "|" + clean(getLabel(e), 80); }
  function visibleFieldEls() {
    return [...document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]), textarea, select, [role=combobox]")]
      .filter((e) => isVisible(e) && !e.disabled && !e.closest("[aria-hidden='true']") && !e.closest("#latentfill-banner"));
  }
  function watchForNextStep() {
    const known = new Set(visibleFieldEls().map(fieldKey));
    if (window.__latentfillNextWatch) { window.__latentfillNextWatch.known = known; return; }
    const w = (window.__latentfillNextWatch = { known });
    let timer = null;
    const check = () => {
      if (window.__latentfillState?.filling) return;
      const empty = visibleFieldEls().filter((e) => (e.type === "checkbox" || e.type === "radio" ? false : !hasValue(e) && !selectedText(e)));
      const fresh = empty.filter((e) => !w.known.has(fieldKey(e)));
      if (!fresh.length) return;
      for (const e of visibleFieldEls()) w.known.add(fieldKey(e));
      try { chrome.runtime.sendMessage({ type: "NEXT_STEP", count: fresh.length }); } catch (_) {}
    };
    new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(check, 1500); })
      .observe(document.body, { subtree: true, childList: true });
  }

  // ---------- Fill ----------
  // Is this upload for the resume or the cover letter? Uses the label, then the nearest text before it.
  const COVER_FILE_RE = /cover[\s_-]*letter|letter of (interest|motivation)|motivation[\s_-]*letter/i;
  const RESUME_FILE_RE = /resume|\bcv\b|curriculum/i;
  const deaccent = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  function fileKind(el, label) {
    const l = deaccent(label);
    if (COVER_FILE_RE.test(l)) return "cover";
    if (RESUME_FILE_RE.test(l)) return "resume";
    for (let node = el.parentElement, i = 0; node && node !== document.body && i < 7; node = node.parentElement, i++) {
      let before = "";
      try { const r = document.createRange(); r.setStart(node, 0); r.setEndBefore(el); before = deaccent(r.toString()); } catch (_) {}
      const all = deaccent(node.innerText || "");
      if (!COVER_FILE_RE.test(all) && !RESUME_FILE_RE.test(all)) continue;
      const lastCover = before.search(new RegExp(COVER_FILE_RE.source + "(?![\\s\\S]*(" + COVER_FILE_RE.source + "))", "i"));
      const lastResume = before.search(new RegExp("(" + RESUME_FILE_RE.source + ")(?![\\s\\S]*(" + RESUME_FILE_RE.source + "))", "i"));
      if (lastCover < 0 && lastResume < 0) return COVER_FILE_RE.test(all) && !RESUME_FILE_RE.test(all) ? "cover" : RESUME_FILE_RE.test(all) && !COVER_FILE_RE.test(all) ? "resume" : null;
      return lastResume > lastCover ? "resume" : "cover";
    }
    return null;
  }

  async function fill(answers, extras = {}) {
    let state = window.__latentfillState;
    if (!state) return { filled: 0, failed: [], review: [] };
    state.filling = true;
    let filled = 0;
    const failed = [];
    const review = [];
    const combos = [];
    // Phase 1: uploads first. Many sites read the resume and rewrite the form when a file is attached,
    // which would wipe answers typed before it.
    let uploaded = false;
    for (const [, f] of state.map) {
      if (f.type !== "file") continue;
      const target = f.target;
      if (isResumeParser(target)) continue; // "Autofill from resume" boxes overwrite your answers
      const kind = fileKind(target, f.label);
      const isCover = kind === "cover";
      const isResume = kind === "resume" || (!kind && extras.fileInputCount === 1);
      try {
        if (isCover && extras.coverLetter && fillFile(target, extras.coverLetter)) { filled++; uploaded = true; review.push("Review attached cover letter: " + f.label); mark(target, true); }
        else if (isResume && fillFile(target, extras.resume)) { filled++; uploaded = true; mark(target, true); }
        else if (f.required) { review.push(f.label); mark(target, false); }
      } catch (_) { failed.push(f.label); }
    }
    if (uploaded) {
      await settle(1500, 1000, 9000);
      const lost = [...state.map.values()].some((f) => f.type !== "file" && !connected(f.target));
      if (lost) {
        // The site re-rendered the form: find the same questions again and carry the answers over.
        const old = [...state.map.entries()].filter(([, f]) => f.type !== "file");
        await collect({ overwrite: true, noProbe: true });
        const ns = window.__latentfillState;
        const used = new Set();
        const remapped = {};
        for (const [oid, of] of old) {
          if (answers[oid] === undefined) continue;
          const hit = [...ns.map.entries()].find(([nid, nf]) => !used.has(nid) && nf.type === of.type && nf.label === of.label);
          if (hit) { used.add(hit[0]); remapped[hit[0]] = answers[oid]; }
        }
        for (const [nid, nf] of [...ns.map.entries()]) if (nf.type === "file") ns.map.delete(nid);
        state = ns;
        state.filling = true;
        answers = remapped;
      }
    }
    // Phase 2: everything else.
    for (const [id, f] of state.map) {
      const value = answers[id];
      const target = f.target;
      const primary = Array.isArray(target) ? target[0] : target;
      try {
        if (f.type === "file") continue;
        if (value === undefined || value === null || value === "") {
          if (f.required) { review.push(f.label); mark(primary, false); }
          continue;
        }
        let ok = false;
        if (f.type === "text" || f.type === "textarea") ok = fillText(target, value);
        else if (f.type === "select" && f.custom) {
          const r = await fillButtonSelect(target, value).catch((e) => ({ ok: false, reason: "error: " + e.message }));
          ok = r.ok;
          if (!ok) f._why = r.reason;
        }
        else if (f.type === "select") ok = fillSelect(target, value);
        else if (f.type === "combobox") {
          const r = await fillCombobox(target, value);
          ok = r.ok;
          if (ok) combos.push({ el: target, want: toText(value), shown: selectedText(target), f });
          else f._why = r.reason;
        }
        else if (f.type === "radio") ok = await fillRadio(target, value);
        else if (f.type === "checkbox") ok = fillCheckbox(target, value);
        else if (f.type === "checkbox_group") ok = fillCheckGroup(target, value);
        if (ok) { filled++; mark(primary, true); }
        else if (f.type === "combobox" || f.custom) { review.push(`Pick "${toText(value)}" manually: ${f.label}${f._why ? ` (${f._why})` : ""}`); mark(primary, false); }
        else { failed.push(f.label); mark(primary, false); }
      } catch (e) {
        failed.push(f.label);
      }
      await sleep(30);
    }
    await sleep(400);
    for (const d of await reverify(combos)) {
      filled--;
      review.push(`Pick "${d.want}" manually: ${d.f.label} (the form reset it after filling)`);
      mark(d.el, false);
    }
    state.aiValues = {};
    for (const [id, f] of state.map) state.aiValues[id] = readValue(f);
    state.filling = false;
    watchForLearning(state);
    try { watchForNextStep(); } catch (_) {}
    return { filled, failed, review };
  }

  // ---------- Running memory: learn from what the user corrects and submits ----------
  const SENSITIVE = /password|ssn|social security|date of birth|birth ?date|\bdob\b|credit card|bank|routing/i;
  const CONSENT = /\b(agree|consent|acknowledge|certify|terms|privacy policy|attest)\b/i;

  function cleanQuestion(label) {
    return clean(String(label || "").replace(/\[name:[^\]]*\]/gi, "").replace(/\(placeholder:[^)]*\)/gi, "").replace(/\*/g, ""), 300);
  }

  function readValue(f) {
    const t = f.target;
    try {
      switch (f.type) {
        case "text":
        case "textarea":
          return t.isContentEditable ? clean(t.innerText, 3000) : (t.value || "").trim();
        case "select":
          if (f.custom) { const v = buttonSelectText(t); return PLACEHOLDER_RE.test(v) ? "" : v; }
          return t.selectedIndex >= 0 && t.value ? clean(t.options[t.selectedIndex].text, 200) : "";
        case "combobox":
          return selectedText(t) || (isReactSelectLike(t) ? "" : (t.value || "").trim());
        case "radio": { const c = t.find((r) => (r.tagName === "INPUT" ? r.checked : isOn(r))); return c ? optionLabel(c) : ""; }
        case "checkbox": return t.checked ? "Yes" : "No";
        case "checkbox_group": return t.filter((c) => c.checked).map(optionLabel).join(", ");
      }
    } catch (_) {}
    return "";
  }

  function learnable(f) {
    const q = cleanQuestion(f.label);
    return f.type !== "file" && q.length >= 2 && !SENSITIVE.test(q) && !CONSENT.test(q);
  }

  function sendLearn(items) {
    if (!items.length) return;
    try { chrome.runtime.sendMessage({ type: "LEARN", items, host: location.hostname }); } catch (_) {}
  }

  function itemFor(f, value, source) {
    return { question: cleanQuestion(f.label), answer: value, type: f.type, options: f.options?.slice(0, 20), source };
  }

  function watchForLearning(state) {
    if (state.watching) return;
    state.watching = true;
    state.lastSent = {};
    const timers = {};
    const record = (id) => {
      clearTimeout(timers[id]);
      timers[id] = setTimeout(() => {
        if (state.filling) return;
        const f = state.map.get(id);
        if (!f || !learnable(f)) return;
        const v = readValue(f);
        if (!v || v === state.aiValues[id] || v === state.lastSent[id]) return;
        if (f.type === "checkbox" && !state.aiValues[id]) return;
        state.lastSent[id] = v;
        sendLearn([itemFor(f, v, "corrected")]);
      }, 600);
    };
    for (const [id, f] of state.map) {
      const els = Array.isArray(f.target) ? f.target : [f.target];
      for (const el of els) {
        el.addEventListener("change", () => record(id));
        if (el.tagName === "BUTTON" || el.getAttribute("role") === "radio") el.addEventListener("click", () => record(id));
        el.addEventListener("focusout", () => record(id));
      }
    }
    // When the user submits / moves to the next step, remember every final short answer.
    let lastFlush = 0;
    const flush = () => {
      if (Date.now() - lastFlush < 3000) return;
      lastFlush = Date.now();
      const items = [];
      for (const [id, f] of state.map) {
        if (!learnable(f) || f.type === "checkbox") continue;
        const v = readValue(f);
        if (!v || v === state.lastSent[id]) continue;
        const untouched = v === state.aiValues[id];
        if (f.type === "textarea" && (untouched || v.length > 400)) continue; // AI-written or job-specific essays
        items.push(itemFor(f, v, untouched ? "confirmed" : "corrected"));
      }
      sendLearn(items);
    };
    document.addEventListener("submit", flush, true);
    document.addEventListener("click", (e) => {
      const b = e.target.closest?.("button, input[type=submit], [role=button], a");
      const t = clean(b?.innerText || b?.value || b?.getAttribute?.("aria-label") || "", 60);
      if (b && /submit|apply|next|continue|save|review|send/i.test(t)) flush();
    }, true);
  }

  window.__latentfillCollect = collect;
  window.__latentfillFill = fill;
  window.__latentfillJob = jobContext;
  window.__latentfillExpand = expand;
  window.__latentfillCommit = commitEntries;
})();
