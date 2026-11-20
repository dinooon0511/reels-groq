import { timingSafeEqual } from "node:crypto";

const reply = (statusCode, payload) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(payload),
});

export async function handler(event) {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST required" });
  const groqKey = process.env.GROQ_API_KEY;
  const accessKey = process.env.TRANSCRIBE_ACCESS_KEY;
  if (!groqKey || !accessKey) return reply(503, { error: "Server not configured" });
  const provided = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(accessKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return reply(401, { error: "Unauthorized" });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return reply(400, { error: "Invalid JSON" }); }
  const { audio_base64, filename = "audio.mp3", language = "ru" } = body;
  if (typeof audio_base64 !== "string" || !/^[A-Za-z0-9+/=]+$/.test(audio_base64)) {
    return reply(400, { error: "audio_base64 required" });
  }
  // Keep well below Netlify's buffered function payload limits.
  if (audio_base64.length > 4_000_000) return reply(413, { error: "Audio too large; split/compress into smaller segments" });
  const audio = Buffer.from(audio_base64, "base64");
  if (!audio.length) return reply(400, { error: "Empty audio" });
  const safeFilename = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "audio.mp3";
  const form = new FormData();
  form.append("file", new Blob([audio]), safeFilename);
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  if (language) form.append("language", String(language).slice(0, 8));
  try {
    const result = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
      signal: AbortSignal.timeout(25000),
    });
    const json = await result.json().catch(() => ({}));
    if (!result.ok) return reply(result.status === 429 ? 429 : 502, { error: "Groq transcription failed", detail: json?.error?.message || result.statusText });
    return reply(200, { text: json.text, words: json.words || [], segments: json.segments || [], duration: json.duration });
  } catch {
    return reply(504, { error: "Transcription request timed out or failed" });
  }
}
