// apps/mobile/tests/helpers/ollama.js
// Local Ollama AI Agent helper for Mobile Emulator testing.
// Zero Gemini / Cloud tokens consumed (100% free and local).
import process from "node:process";
import config from "../../mobile.config.mjs";

const OLLAMA_BASE_URL = config.ollama.host || "http://127.0.0.1:11434";

/**
 * Check if the local Ollama server is running and discover installed models.
 */
export async function checkOllamaServer() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { method: "GET" });
    if (!res.ok) return { online: false, models: [] };
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    return { online: true, models };
  } catch {
    return { online: false, models: [] };
  }
}

/**
 * Pick the best available model from Ollama.
 * Prefers vision models if an image is provided; otherwise prefers installed models like qwen2.5:3b.
 */
export async function resolveOllamaModel(needVision = false) {
  const { online, models } = await checkOllamaServer();
  if (!online || models.length === 0) return null;

  const visionCandidates = config.ollama.visionCandidates || [
    "qwen2.5-vl",
    "llama3.2-vision",
    "moondream",
    "llava",
    "bakllava",
  ];

  if (needVision) {
    const matchedVision = models.find((m) =>
      visionCandidates.some((v) => m.toLowerCase().includes(v))
    );
    if (matchedVision) return { name: matchedVision, isVision: true };
  }

  // Fallback to configured model or first installed model
  const defaultModel =
    models.find((m) => m.includes(config.ollama.preferredTextModel)) || models[0];
  const isVision = visionCandidates.some((v) => defaultModel.toLowerCase().includes(v));
  return { name: defaultModel, isVision };
}

/**
 * Send an audit request to local Ollama.
 * Accepts prompt and optional screenshotBuffer or mobile viewSummary.
 */
export async function auditWithOllama({
  prompt,
  screenshotBuffer = null,
  domSummary = "",
  system = "You are an expert mobile QA and UX evaluation agent for Android/React Native apps. Analyze the provided mobile screen state for UI clipping, truncated labels, touch target overlap, contrast issues, and usability bugs. Always return concise JSON with 'passed' (boolean), 'verdict' (string), and 'issues' (array of strings).",
}) {
  const modelInfo = await resolveOllamaModel(!!screenshotBuffer);

  if (!modelInfo) {
    return {
      available: false,
      reason: "Ollama server is not running at http://127.0.0.1:11434 or no model is installed.",
      verdict: "skipped",
    };
  }

  const payload = {
    model: modelInfo.name,
    prompt: domSummary
      ? `${prompt}\n\nMOBILE UI VIEW HIERARCHY SUMMARY:\n${domSummary}`
      : prompt,
    system,
    stream: false,
    format: "json",
    options: {
      temperature: config.ollama.temperature || 0.1,
    },
  };

  // If model supports vision and image buffer was passed
  if (modelInfo.isVision && screenshotBuffer) {
    payload.images = [screenshotBuffer.toString("base64")];
  }

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return {
        available: false,
        reason: `Ollama returned ${res.status}: ${res.statusText}`,
        verdict: "error",
      };
    }

    const json = await res.json();
    let parsed;
    try {
      let raw = json.response.trim();
      if (raw.startsWith("```json")) raw = raw.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      else if (raw.startsWith("```")) raw = raw.replace(/^```\s*/, "").replace(/\s*```$/, "");
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw_text: json.response, format_error: true };
    }

    return {
      available: true,
      modelUsed: modelInfo.name,
      isVisionUsed: modelInfo.isVision && !!screenshotBuffer,
      result: parsed,
    };
  } catch (err) {
    return { available: false, reason: err.message, verdict: "error" };
  }
}
