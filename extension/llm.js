// Provider-agnostic AI call. Returns parsed JSON.
// pdf (optional): { dataUrl, name, type } to send a PDF resume directly to the model.

const DEFAULT_MODELS = {
  openai: "gpt-5-mini",
  anthropic: "claude-haiku-4-5",
  gemini: "gemini-3.5-flash-lite",
  openai_compatible: "llama3.1"
};

function parseJsonLoose(text) {
  if (!text) throw new Error("Empty response from the AI model.");
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try { return JSON.parse(t); } catch (_) {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("The AI model did not return valid JSON.");
}

async function httpJson(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let res, body;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
    body = await res.text();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("AI request timed out after 45 seconds. Try again or choose another model.");
    throw e;
  } finally { clearTimeout(timer); }
  if (!res.ok) {
    let msg = body;
    try { const j = JSON.parse(body); msg = j.error?.message || j.message || body; } catch (_) {}
    throw new Error(`AI request failed (${res.status}): ${String(msg).slice(0, 300)}`);
  }
  return JSON.parse(body);
}

async function callLLM(settings, system, user, pdf = null) {
  const provider = settings.provider || "openai";
  const model = (settings.model || "").trim() || DEFAULT_MODELS[provider];
  const key = (settings.apiKey || "").trim();
  const b64 = pdf ? pdf.dataUrl.split(",")[1] : null;

  if (provider === "anthropic") {
    const content = pdf
      ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }, { type: "text", text: user }]
      : user;
    const j = await httpJson("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model, max_tokens: 8000, system, messages: [{ role: "user", content }] })
    });
    return parseJsonLoose((j.content || []).filter((c) => c.type === "text").map((c) => c.text).join(""));
  }

  if (provider === "gemini") {
    const parts = pdf ? [{ inline_data: { mime_type: "application/pdf", data: b64 } }, { text: user }] : [{ text: user }];
    const j = await httpJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
        })
      }
    );
    return parseJsonLoose(j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join(""));
  }

  // OpenAI and any OpenAI-compatible server (OpenRouter, Groq, Together, Ollama, LM Studio...)
  const base = provider === "openai" ? "https://api.openai.com/v1" : (settings.baseUrl || "http://localhost:11434/v1").replace(/\/+$/, "");
  if (pdf && provider !== "openai") throw new Error("PDF reading needs OpenAI, Anthropic, or Gemini. Paste your resume text instead.");
  const userContent = pdf
    ? [{ type: "file", file: { filename: pdf.name || "resume.pdf", file_data: pdf.dataUrl } }, { type: "text", text: user }]
    : user;
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  const j = await httpJson(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
      response_format: { type: "json_object" }
    })
  });
  return parseJsonLoose(j.choices?.[0]?.message?.content);
}

if (typeof self !== "undefined") { self.callLLM = callLLM; self.DEFAULT_MODELS = DEFAULT_MODELS; }
