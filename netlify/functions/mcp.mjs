import { timingSafeEqual } from "node:crypto";
import { handler as transcribe } from "./transcribe.mjs";

const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  body: JSON.stringify(body),
});
const error = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const schema = {
  type: "object",
  properties: {
    audio_base64: { type: "string", description: "Base64 encoded short MP3/M4A/WAV audio, under 4 MB encoded" },
    filename: { type: "string", description: "Filename including extension, e.g. clip.mp3" },
    language: { type: "string", description: "Language code, default ru" }
  },
  required: ["audio_base64"],
  additionalProperties: false
};
export async function handler(event) {
  if (event.httpMethod === "GET") return json(200, { service: "Reels Groq MCP", status: "ready", authentication: "bearer-required" });
  if (event.httpMethod !== "POST") return json(405, { error: "POST required" });
  let req;
  try { req = JSON.parse(event.body || "{}"); }
  catch { return json(400, error(null,-32700,"Parse error")); }
  if (Array.isArray(req)) return json(400,error(null,-32600,"Batch requests not supported"));
  const { id = null, method, params = {} } = req;
  if (req.jsonrpc !== "2.0" || typeof method !== "string") return json(400,error(id,-32600,"Invalid Request"));
  if (method === "notifications/initialized") return { statusCode: 202, body: "" };
  if (method === "initialize") return json(200,ok(id,{
    protocolVersion: "2025-03-26",
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "reels-groq", version: "0.1.0" }
  }));
  if (method === "ping") return json(200,ok(id,{}));
  if (method === "tools/list") return json(200,ok(id,{ tools: [{
    name: "transcribe_audio",
    description: "Transcribe a short Russian audio clip with Groq Whisper, returning text and word/segment timestamps. Only accepts small base64 audio clips.",
    inputSchema: schema
  }] }));
  if (method === "tools/call") {
    // Allow public MCP discovery, but never invoke Groq without a valid credential.
    const secret = process.env.TRANSCRIBE_ACCESS_KEY;
    if (!secret) return json(503, { error: "Server not configured" });
    const supplied = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
    const a = Buffer.from(supplied), b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return json(401, { error: "Unauthorized: connect with TRANSCRIBE_ACCESS_KEY" }, { "WWW-Authenticate": 'Bearer realm="reels-groq"' });
    }
    if (params?.name !== "transcribe_audio") return json(200,error(id,-32602,"Unknown tool"));
    const args = params?.arguments || {};
    const result = await transcribe({
      httpMethod: "POST",
      headers: { authorization: "Bearer " + secret },
      body: JSON.stringify(args)
    });
    let data;
    try { data = JSON.parse(result.body); } catch { data = { error: "Invalid backend response" }; }
    return json(200,ok(id,{
      isError: result.statusCode !== 200,
      content: [{ type: "text", text: JSON.stringify(data) }]
    }));
  }
  return json(200,error(id,-32601,"Method not found"));
}
