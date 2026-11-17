// Stand-in for the OpenAI API during QA, so no request ever reaches the paid service:
// POST /v1/responses → a fixed agent draft, POST /v1/images/generations → a 1024x1024 PNG gradient.
// Every call is logged to stdout (QA greps it). Usage: node qa/mock-openai.mjs <port>
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";
const W = 1024, H = 1024;
const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = t[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = 20 + x / 8; raw[o + 1] = 40 + y / 10; raw[o + 2] = 120 + (x + y) / 16; }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
createServer((req, res) => {
  let body = ""; req.on("data", (d) => (body += d)); req.on("end", () => {
    console.log(req.method, req.url, body.slice(0, 300).replace(/\s+/g, " "));
    res.setHeader("content-type", "application/json");
    if (req.url.endsWith("/images/generations")) return res.end(JSON.stringify({ created: 1, data: [{ b64_json: png.toString("base64") }] }));
    if (req.url.endsWith("/responses")) {
      const text = JSON.stringify({ reply: "제품 사진 초안을 만들었어요.", prompt: "Product photo of a matte black wireless earbud case on wet concrete, blue rim light, 100mm macro lens, shallow depth of field", ready: true, title: "젖은 콘크리트 이어폰 케이스", model: "Flux.1 D", references: [] });
      return res.end(JSON.stringify({ id: "resp_mock", object: "response", created_at: 1, status: "completed", model: "mock", output: [{ id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }] }));
    }
    res.statusCode = 404; res.end("{}");
  });
}).listen(Number(process.argv[2] || 3099), () => console.log("mock ready"));
