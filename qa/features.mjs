// Feature QA for the PR series (runs after e2e.mjs on the same DB).
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
const BASE = process.env.BASE, DB = process.env.DB;
let pass = 0, fail = 0;
const check = (name, ok, info = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? `  — ${info}` : ""}`); };
const db = () => new Database(DB, { readonly: true });
const get = async (path, cookie = "") => { const r = await fetch(BASE + path, { redirect: "manual", headers: { cookie } }); return { status: r.status, location: r.headers.get("location"), html: await r.text() }; };
const POSTS = JSON.parse(readFileSync(new URL("../src/data/civitai.json", import.meta.url)));
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
class Browser {
  cookie = "";
  async req(path, init = {}) {
    const res = await fetch(BASE + path, { ...init, redirect: "manual", headers: { ...(init.headers ?? {}), cookie: this.cookie } });
    const set = res.headers.get("set-cookie");
    if (set) { const m = set.match(/promhub_session=([^;]*)/); if (m) this.cookie = m[1] ? `promhub_session=${m[1]}` : ""; }
    return { status: res.status, location: res.headers.get("location"), html: await res.text() };
  }
  get(path) { return this.req(path); }
  /** Submits the <form> on `path` whose markup contains `marker` (hidden fields kept), with `fields` added. */
  async submit(path, marker, fields = {}) {
    const page = await this.get(path);
    const form = [...page.html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].find((m) => m[0].includes(marker));
    if (!form) return { status: -1, html: "", location: null };
    const body = new FormData();
    for (const m of form[1].matchAll(/<input([^>]*?)\/?>/g)) {
      const name = m[1].match(/name="([^"]*)"/)?.[1]; if (!name) continue;
      if ((m[1].match(/type="([^"]*)"/)?.[1] ?? "text") === "hidden") body.set(decode(name), decode(m[1].match(/value="([^"]*)"/)?.[1] ?? ""));
    }
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    return this.req(path, { method: "POST", body });
  }
  async login(username, password) { return this.submit("/login", 'name="username"', { username, password }); }
}
const PNG_BYTES = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PNG = new File([PNG_BYTES], "result.png", { type: "image/png" });
/** Stores a PNG owned by `username` (like a generated preview) and returns its /api/images src. */
const seedImage = (username) => {
  const w = new Database(DB);
  const id = w.prepare("insert into images (owner_id, mime, data) values ((select id from users where username=?), 'image/png', ?)").run(username, Buffer.from(PNG_BYTES)).lastInsertRowid;
  w.close();
  return `/api/images/${id}`;
};
const alice = new Browser(); await alice.login("qa_alice", "qa-pass-1234");
const bob = new Browser(); await bob.login("qa_bob", "qa-pass-5678");
const cards = (html) => new Set([...html.matchAll(/href="(\/(?:p|repos)\/[^"]+)"/g)].map((m) => m[1]));

// Setup: one public original repo (the /new flow needs the AI chat, so it is inserted directly).
{
  const w = new Database(DB);
  const alice = w.prepare("select id from users where username='qa_alice'").get().id;
  const now = new Date().toISOString();
  const repo = w.prepare("insert into repos (owner_id, name, description, model, style, visibility, created_at, updated_at) values (?, 'qa-neon-fox', 'QA 네온 여우', 'Flux.1 D', 'illustration', 'public', ?, ?)").run(alice, now, now).lastInsertRowid;
  const commit = w.prepare("insert into commits (repo_id, hash, message, prompt, created_at) values (?, ?, ?, ?, ?)");
  commit.run(repo, "aaaaaaa", "Initial commit", "neon fox spirit in a rainy city, glowing tails, soft blue palette", now);
  commit.run(repo, "bbbbbbb", "색감 변경", "neon fox spirit in a rainy city, glowing tails, pastel pink palette, <img src=x onerror=alert(1)>", now);
  w.close();
}

// ---- PR1: header search
{
  let r = await get("/");
  check("[검색] 헤더 검색 폼 (action=/, name=q)", /<form[^>]*action="\/"[^>]*role="search"|role="search"[^>]*action="\/"/.test(r.html) && r.html.includes('name="q"'));
  const target = POSTS.find((p) => p.title.trim().length > 3);
  const word = target.title.split(/\s+/).find((w) => w.length >= 4) ?? target.title;
  const want = POSTS.filter((p) => [p.title, p.author, p.model, p.prompt].join("\n").toLowerCase().includes(word.toLowerCase()));
  r = await get(`/?q=${encodeURIComponent(word)}`);
  const got = [...cards(r.html)].filter((h) => h.startsWith("/p/"));
  check(`[검색] "${word}" → 게시물 ${want.length}건 일치`, r.status === 200 && got.length === want.length && want.every((p) => got.includes(`/p/${p.id}`)), `화면 ${got.length}건`);
  check("[검색] 결과 건수 문구", r.html.includes("검색 결과") && r.html.includes("검색 지우기"));
  const two = `${target.author} ${word}`;
  r = await get(`/?q=${encodeURIComponent(two)}`);
  check("[검색] 여러 단어 AND 검색", cards(r.html).has(`/p/${target.id}`) && [...cards(r.html)].filter((h) => h.startsWith("/p/")).length <= want.length);
  r = await get(`/?q=${encodeURIComponent(word.toUpperCase())}`);
  check("[검색] 대소문자 무시", cards(r.html).has(`/p/${target.id}`));
  r = await get("/?q=zzqxnomatch");
  check("[검색] 결과 없음 안내", r.html.includes("일치하는 프롬프트가 없습니다") && cards(r.html).size === 0);
  r = await get(`/?q=${encodeURIComponent('<script>alert(1)</script>')}`);
  check("[검색] 검색어 HTML 이스케이프", r.status === 200 && !r.html.includes("<script>alert(1)</script>"));
  r = await get("/?q=a&q=b"); check("[검색] q 중복 파라미터 200", r.status === 200);
  r = await get(`/?q=${"x".repeat(5000)}`); check("[검색] 아주 긴 검색어 200", r.status === 200);
  r = await get("/?q=%20%20"); check("[검색] 공백 검색어 = 전체 피드", !r.html.includes("검색 결과") && cards(r.html).size >= POSTS.length);
  const priv = db().prepare("select r.id, (select prompt from commits c where c.repo_id=r.id order by id desc limit 1) p from repos r where visibility='private' limit 1").get();
  if (priv) { r = await get(`/?q=${encodeURIComponent(priv.p.split(/\s+/).slice(0, 3).join(" "))}`); check("[검색] 비공개 저장소 미노출", !cards(r.html).has(`/repos/${priv.id}`)); }
  const pub = db().prepare("select r.id, r.description d from repos r where visibility='public' and forked_repo_id is null and forked_post_id is null limit 1").get();
  if (pub) { r = await get(`/?q=${encodeURIComponent(pub.d)}`); check("[검색] 공개 원본 저장소 검색", cards(r.html).has(`/repos/${pub.id}`)); }
}

// ---- PR2: version diff
{
  const repo = db().prepare("select id from repos where name='qa-neon-fox'").get().id;
  let r = await get(`/repos/${repo}`);
  check("[비교] HEAD 에 변경 사항 보기 링크", r.html.includes(`href="/repos/${repo}?v=2&amp;diff=1"`) && r.html.includes("변경 사항 보기"));
  r = await get(`/repos/${repo}?v=1`);
  check("[비교] v1 엔 비교 링크 없음", r.status === 200 && !r.html.includes("변경 사항 보기"));
  r = await get(`/repos/${repo}?v=2&diff=1`);
  const t = r.html.replace(/<!-- -->/g, "");
  check("[비교] v1 → v2 화면 (왼쪽 비교, 오른쪽 현재 프롬프트)", r.status === 200 && t.includes("v1 → v2") && t.includes("프롬프트 보기") && t.indexOf("v1 → v2") < t.indexOf("<aside"));
  check("[비교] 추가/삭제 표시", t.includes("[추가] ") && t.includes("[삭제] ") && /text-mint">\+\d/.test(t) && /text-tile-pink">−\d/.test(t));
  check("[비교] 삭제 단어 soft blue, 추가 단어 pastel pink", /\[삭제\] <\/span>soft blue/.test(t) && /\[추가\] <\/span>pastel pink/.test(t));
  check("[비교] 프롬프트 HTML 이스케이프", !r.html.includes("<img src=x onerror") && r.html.includes("&lt;img src=x"));
  check("[비교] 기준 버전 선택 폼", r.html.includes('name="diff"') && r.html.includes('name="v"') && t.includes("v1 · Initial commit"));
  r = await get(`/repos/${repo}?v=1&diff=2`);
  check("[비교] 역방향 (v2 → v1)", r.html.replace(/<!-- -->/g, "").includes("v2 → v1"));
  for (const q of ["v=2&diff=2", "v=2&diff=abc", "v=2&diff=99", "v=2&diff=-1", "diff=1.5"]) {
    r = await get(`/repos/${repo}?${q}`);
    check(`[비교] 잘못된 비교값 ${q} → 일반 보기`, r.status === 200 && r.html.includes(">Copy<"));
  }
  const priv = db().prepare("select id from repos where visibility='private' limit 1").get();
  if (priv) { r = await get(`/repos/${priv.id}?v=2&diff=1`); check("[비교] 비공개 저장소 비교 404", r.status === 404); }
}

// ---- PR3: result image per version
{
  const repo = db().prepare("select id from repos where name='qa-neon-fox'").get().id;
  const cols = db().prepare("pragma table_info(commits)").all().map((c) => c.name);
  check("[결과이미지] 기존 DB 마이그레이션 (image_json 컬럼)", cols.includes("image_json"));
  const head = () => db().prepare("select id, message, prompt, image_json from commits where repo_id=? order by id desc limit 1").get(repo);
  const before = head();
  let r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: before.prompt, message: "결과 이미지 추가", previewImage: seedImage("qa_alice"), previewWidth: "640", previewHeight: "999999" });
  const after = head(); const img = JSON.parse(after.image_json ?? "null");
  check("[결과이미지] 프롬프트 그대로 + 이미지만으로 새 버전", r.status === 303 && after.id !== before.id && after.prompt === before.prompt && after.message === "결과 이미지 추가");
  check("[결과이미지] 이미지 저장 + 크기 (높이 10000 으로 제한)", /^\/api\/images\/\d+$/.test(img?.src) && img.width === 640 && img.height === 10000, JSON.stringify(img));
  const cover = JSON.parse(db().prepare("select cover_json c from repos where id=?").get(repo).c ?? "null");
  check("[결과이미지] 저장소 대표 이미지 = 최신 결과", cover?.src === img?.src);
  const file = await fetch(BASE + img.src); check("[결과이미지] 이미지 응답 PNG", file.status === 200 && file.headers.get("content-type") === "image/png");
  r = await get(`/repos/${repo}`);
  const t = r.html.replace(/<!-- -->/g, "");
  check("[결과이미지] HEAD 화면 왼쪽에 큰 결과 이미지", /alt="[^"]* v3"/.test(t) && t.indexOf(`src="${img.src}"`) < t.indexOf("<aside"));
  check("[결과이미지] 히스토리 썸네일", (r.html.match(new RegExp(`src="${img.src}"`, "g")) ?? []).length >= 2);
  r = await get(`/repos/${repo}?v=2`);
  check("[결과이미지] 이미지 없는 버전은 이미지 영역 없음", r.status === 200 && !r.html.replace(/<!-- -->/g, "").includes("v2 결과 이미지"));
  r = await get(`/repos/${repo}?v=3&diff=2`);
  const d = r.html.replace(/<!-- -->/g, "");
  check("[결과이미지] 비교 화면 전/후 이미지", d.includes("v2 결과") && d.includes("v3 결과") && d.includes("결과 이미지 없음"));
  check("[결과이미지] 프롬프트 동일 → +0 −0", d.includes("두 버전의 프롬프트가 같습니다"));
  const images = () => db().prepare("select count(*) c from images").get().c;
  const n0 = images();
  r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: before.prompt, message: "file", image: PNG, imageWidth: "1", imageHeight: "1" });
  check("[결과이미지] 파일 직접 업로드는 더 이상 받지 않음 (저장 안 됨)", r.html.includes("달라진 내용이 없습니다") && head().message !== "file" && images() === n0);
  r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: before.prompt, message: "no-op" });
  check("[결과이미지] 이미지·프롬프트 모두 그대로면 거부", r.html.includes("달라진 내용이 없습니다") && head().message !== "no-op");
  const own = db().prepare("select id from repos where owner_id=(select id from users where username='qa_bob') limit 1").get();
  r = await bob.submit(`/repos/${own.id}?edit=1`, 'name="repoId"', { repoId: String(repo), prompt: "x", message: "hack-img", previewImage: seedImage("qa_bob") });
  check("[결과이미지] 남의 저장소에 이미지 커밋 차단", head().message !== "hack-img");
  r = await alice.get(`/repos/${repo}?edit=1`);
  check("[결과이미지] 커밋 폼에 파일 업로드 칸 없음", !r.html.includes('name="image"') && !r.html.includes("결과 이미지 직접 올리기"));
  r = await get("/");
  check("[결과이미지] 피드 카드가 최신 결과 이미지로", r.html.includes(`src="${img.src}"`));
}

// ---- PR4: images of private repos
{
  const guest = new Browser();
  const repo = db().prepare("select id from repos where owner_id=(select id from users where username='qa_alice') and visibility='private' limit 1").get().id;
  const head = db().prepare("select prompt from commits where repo_id=? order by id desc limit 1").get(repo).prompt;
  let r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: head + ", secret", message: "비공개 결과", previewImage: seedImage("qa_alice") });
  const src = JSON.parse(db().prepare("select image_json j from commits where repo_id=? order by id desc limit 1").get(repo).j ?? "null")?.src;
  const status = async (who) => (await who.get(src)).status;
  check("[이미지권한] 비공개 저장소 이미지 업로드", r.status === 303 && !!src, src);
  check("[이미지권한] 비공개: 작성자 200 / 비로그인 404 / 다른 유저 404", (await status(alice)) === 200 && (await status(guest)) === 404 && (await status(bob)) === 404);
  const res = await fetch(BASE + src, { headers: { cookie: alice.cookie } });
  check("[이미지권한] 캐시 헤더 private", res.headers.get("cache-control")?.startsWith("private") && res.headers.get("vary")?.includes("Cookie"), res.headers.get("cache-control"));
  r = await alice.submit(`/repos/${repo}`, "누르면 공개로 전환");
  check("[이미지권한] 공개 전환 후 비로그인 200", (await status(guest)) === 200);
  r = await bob.submit(`/repos/${repo}`, "Fork");
  const fork = Number(r.location?.match(/\/repos\/(\d+)/)?.[1]);
  check("[이미지권한] bob 포크 대표 이미지 = alice 이미지", JSON.parse(db().prepare("select cover_json c from repos where id=?").get(fork)?.c ?? "null")?.src === src);
  r = await alice.submit(`/repos/${repo}`, "누르면 비공개로 전환");
  check("[이미지권한] 다시 비공개 → 비로그인 404", (await status(guest)) === 404);
  check("[이미지권한] bob 은 자기 비공개 포크에서 계속 보임", (await status(bob)) === 200);
  check("[이미지권한] 없는 이미지 / 잘못된 id 404", (await guest.get("/api/images/999999")).status === 404 && (await guest.get("/api/images/abc")).status === 404);
  const pub = JSON.parse(db().prepare("select cover_json c from repos where name='qa-neon-fox'").get().c).src;
  check("[이미지권한] 공개 저장소 이미지는 비로그인 200", (await guest.get(pub)).status === 200);
}

// ---- PR5: AI rate limit (server actions called the way the client does)
{
  const { readdirSync, readFileSync: read } = await import("node:fs");
  const chunks = (dir) => readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(".js")).map((f) => read(`${dir}/${f}`, "utf8")).join("\n");
  const js = chunks(".next/static");
  const actionId = (name) => js.match(new RegExp(`\\("([0-9a-f]{40,})",[^)]{0,80}"${name}"`))?.[1];
  const chatId = actionId("chatPromptBuilder"), uploadId = actionId("uploadChatFileAction");
  check("[AI제한] 서버 액션 id 찾기", !!chatId && !!uploadId);
  const carol = new Browser();
  await carol.submit("/signup", 'name="username"', { username: "qa_carol", password: "qa-pass-9999", passwordConfirm: "qa-pass-9999" });
  const chat = async (who) => {
    const res = await fetch(BASE + "/new", { method: "POST", headers: { cookie: who.cookie, "Next-Action": chatId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
      body: JSON.stringify([[], "비 오는 골목의 고양이", [], { model: "Flux.1 D", style: "photo" }]) });
    return res.text();
  };
  const upload = async (who) => {
    const body = new FormData(); body.set("_1_file", new File(["hello"], "note.txt", { type: "text/plain" })); body.set("0", '["$K1"]');
    const res = await fetch(BASE + "/new", { method: "POST", headers: { cookie: who.cookie, "Next-Action": uploadId, Accept: "text/x-component" }, body });
    return res.text();
  };
  const outs = []; for (let i = 0; i < 11; i++) outs.push(await chat(carol));
  const remaining = outs.slice(0, 10).map((t) => Number(t.match(/"remainingToday":(\d+)/)?.[1]));
  check("[AI제한] 1분 10회까지 응답 + 남은 횟수 99→90", remaining[0] === 99 && remaining[9] === 90 && remaining.every((n, i) => n === 99 - i), remaining.join(","));
  check("[AI제한] 11번째 요청 차단 (대기 시간 안내)", /AI 요청이 너무 잦아요\. (\d+초|1분) 후에/.test(outs[10]) && !outs[10].includes("remainingToday"), outs[10].slice(-120));
  check("[AI제한] 차단된 요청은 기록 안 됨", db().prepare("select count(*) c from rate_events e join users u on u.id=e.user_id where u.username='qa_carol' and kind='ai_chat'").get().c === 10);
  // Other users are unaffected.
  check("[AI제한] 다른 유저는 영향 없음", (await chat(bob)).includes('"remainingToday":99'));
  // Daily cap: pretend carol used 100 turns earlier today (outside the minute window).
  const w = new Database(DB);
  const carolId = w.prepare("select id from users where username='qa_carol'").get().id;
  w.prepare("delete from rate_events where user_id=?").run(carolId);
  const ins = w.prepare("insert into rate_events (user_id, kind, at) values (?, 'ai_chat', ?)");
  const t0 = Date.now() - 2 * 3600_000; for (let i = 0; i < 100; i++) ins.run(carolId, t0 + i);
  ins.run(carolId, Date.now() - 25 * 3600_000); // older than a day: pruned, never counted
  w.close();
  let out = await chat(carol);
  check("[AI제한] 하루 100회 초과 차단 (시간 단위 안내)", /오늘 AI 요청 한도\(100회\)를 모두 사용했어요\. 22시간 후에/.test(out), out.slice(-140));
  check("[AI제한] 하루 지난 기록 정리", db().prepare("select count(*) c from rate_events where user_id=? and at < ?").get(carolId, Date.now() - 24 * 3600_000).c === 0);
  out = await upload(carol);
  check("[AI제한] 파일 첨부는 별도 한도 (AI 한도와 무관)", out.includes('"ok":true') && out.includes("note.txt"), out.slice(-120));
  const outsU = []; for (let i = 0; i < 20; i++) outsU.push(await upload(carol));
  check("[AI제한] 파일 첨부 1분 20회 제한", outsU.slice(0, 19).every((t) => t.includes('"ok":true')) && outsU[19].includes("파일 첨부 요청이 너무 잦아요"), outsU[19].slice(-100));
  const anon = await fetch(BASE + "/new", { method: "POST", redirect: "manual", headers: { "Next-Action": chatId, "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify([[], "x", [], { model: "", style: "photo" }]) });
  check("[AI제한] 비로그인 요청은 로그인으로 (기록 없음)", anon.status === 303 || (anon.headers.get("x-action-redirect") ?? "").includes("/login"), `status ${anon.status}`);
}

// ---- PR6: following feed
{
  const guest = new Browser();
  const carol = new Browser(); await carol.login("qa_carol", "qa-pass-9999");
  const neon = db().prepare("select id from repos where name='qa-neon-fox'").get().id;
  const alicePrivate = db().prepare("select id from repos where owner_id=(select id from users where username='qa_alice') and visibility='private' limit 1").get()?.id;
  // carol gets an older public fork of neon fox.
  const w = new Database(DB);
  const carolId = w.prepare("select id from users where username='qa_carol'").get().id;
  const old = new Date(Date.now() - 3 * 864e5).toISOString();
  const carolRepo = w.prepare("insert into repos (owner_id, name, description, model, style, visibility, forked_repo_id, forked_label, created_at, updated_at) values (?, 'carol-fork', '캐롤 포크 여우', 'Flux.1 D', 'illustration', 'public', ?, 'qa_alice / qa-neon-fox', ?, ?)").run(carolId, neon, old, old).lastInsertRowid;
  w.prepare("insert into commits (repo_id, hash, message, prompt, created_at) values (?, 'ccccccc', 'Fork', 'fox with lantern', ?)").run(carolRepo, old);
  w.close();

  let r = await guest.get("/?feed=following");
  check("[팔로잉] 비로그인 → 로그인 안내", r.status === 200 && r.html.includes("로그인하면 팔로우한") && cards(r.html).size === 0);
  r = await carol.get("/?feed=following");
  check("[팔로잉] 팔로우 없음 → 빈 화면 + 둘러보기", r.html.includes("아직 팔로우한 사람이 없거나") && cards(r.html).size === 0);
  r = await bob.get("/?feed=following");
  const t = r.html.replace(/<!-- -->/g, "");
  check("[팔로잉] alice 공개 저장소 + 버전·시간 표시", cards(r.html).has(`/repos/${neon}`) && /v3 · (방금|\d+분 전)/.test(t));
  check("[팔로잉] 비공개 저장소·Civitai 게시물 제외", (!alicePrivate || !cards(r.html).has(`/repos/${alicePrivate}`)) && ![...cards(r.html)].some((h) => h.startsWith("/p/")));
  r = await bob.submit("/u/qa_carol", "Follow");
  r = await bob.get("/?feed=following");
  const order = [...r.html.matchAll(/href="\/repos\/(\d+)"/g)].map((m) => Number(m[1])).filter((v, i, a) => a.indexOf(v) === i);
  check("[팔로잉] 포크 포함 + 최근 업데이트 순", order.indexOf(neon) !== -1 && order.indexOf(Number(carolRepo)) > order.indexOf(neon) && r.html.replace(/<!-- -->/g, "").includes("3일 전"), order.join(","));
  r = await bob.get("/?feed=following&q=lantern");
  check("[팔로잉] 팔로잉 피드 안에서 검색", cards(r.html).has(`/repos/${carolRepo}`) && !cards(r.html).has(`/repos/${neon}`));
  r = await bob.get("/?feed=following&q=zzqx");
  check("[팔로잉] 검색 결과 없음 안내", r.html.includes("팔로잉 피드에 일치하는"));
  r = await guest.get("/");
  check("[팔로잉] 탭: 둘러보기 활성 + 팔로잉 링크", r.html.includes('href="/?feed=following"') && /aria-current="page"[^>]*>둘러보기|>둘러보기</.test(r.html));
  r = await guest.get("/?q=fox");
  check("[팔로잉] 탭 링크가 검색어 유지", r.html.includes('href="/?feed=following&amp;q=fox"'));
  r = await bob.submit("/u/qa_carol", "Following");
  r = await bob.get("/?feed=following");
  check("[팔로잉] 언팔로우하면 사라짐", !cards(r.html).has(`/repos/${carolRepo}`) && cards(r.html).has(`/repos/${neon}`));
  r = await guest.get("/");
  check("[팔로잉] 둘러보기엔 포크 미노출 유지", !cards(r.html).has(`/repos/${carolRepo}`));
}

// ---- Model picked by the agent (no model field on /new)
{
  const { readdirSync, readFileSync: read } = await import("node:fs");
  const js = readdirSync(".next/static", { recursive: true }).filter((f) => f.endsWith(".js")).map((f) => read(`.next/static/${f}`, "utf8")).join("\n");
  const createId = js.match(/\("([0-9a-f]{40,})",[^)]{0,80}"createRepoAction"/)?.[1];
  const create = async (fields) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(`_1_${k}`, v);
    body.set("0", '["$undefined","$K1"]');
    const res = await fetch(BASE + "/new", { method: "POST", redirect: "manual", headers: { cookie: alice.cookie, "Next-Action": createId, Accept: "text/x-component" }, body });
    return { status: res.status, redirect: res.headers.get("x-action-redirect") ?? res.headers.get("location") ?? "", text: await res.text() };
  };
  const modelOf = (r) => db().prepare("select model from repos where id=?").get(Number(r.redirect.match(/\/repos\/(\d+)/)?.[1]))?.model;
  let r = await alice.get("/new");
  check("[모델] 새 프롬프트 화면에 모델 입력칸 없음", r.status === 200 && !r.html.includes("사용 모델") && !r.html.includes('list="models"'));
  check("[모델] 모델은 숨은 값으로 전송 (기본 애니 → Illustrious)", /<input type="hidden" name="model" value="Illustrious"/.test(r.html));
  check("[모델] createRepoAction id", !!createId);
  r = await create({ title: "모델 없음", style: "photo", prompt: "a cat on a roof", visibility: "private" });
  check("[모델] 모델 없이 저장 → 스타일 기본값 (실사 → Flux.1 D)", modelOf(r) === "Flux.1 D", r.redirect || r.text.slice(-100));
  r = await create({ title: "모델 지정", style: "anime", prompt: "1girl", model: "Pony", visibility: "private" });
  check("[모델] AI 가 고른 모델 저장 (Pony)", modelOf(r) === "Pony");
  r = await create({ title: "긴 모델", style: "anime", prompt: "1girl", model: "x".repeat(200), visibility: "private" });
  check("[모델] 모델 이름 60자로 자름", modelOf(r)?.length === 60);
  r = await create({ title: "", style: "anime", prompt: "1girl", visibility: "private" });
  check("[모델] 제목 없으면 오류", r.text.includes("제목을 입력해주세요"));
}

// ---- Image preview action (QA runs offline: no key → clear error, quota untouched)
{
  const { readdirSync, readFileSync: read } = await import("node:fs");
  const js = readdirSync(".next/static", { recursive: true }).filter((f) => f.endsWith(".js")).map((f) => read(`.next/static/${f}`, "utf8")).join("\n");
  const previewId = js.match(/\("([0-9a-f]{40,})",[^)]{0,80}"generatePreviewAction"/)?.[1];
  const preview = async (who, prompt, style) => {
    const res = await fetch(BASE + "/new", { method: "POST", redirect: "manual", headers: { cookie: who?.cookie ?? "", "Next-Action": previewId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" }, body: JSON.stringify([prompt, style]) });
    return { status: res.status, redirect: res.headers.get("x-action-redirect") ?? "", text: await res.text() };
  };
  check("[미리보기] generatePreviewAction id", !!previewId);
  const used = () => db().prepare("select count(*) c from rate_events e join users u on u.id=e.user_id where u.username='qa_alice' and kind='image_preview'").get().c;
  let r = await preview(alice, "a cat on a roof\nNegative prompt: blurry", "photo");
  const made = JSON.parse(r.text.split("\n").find((l) => l.startsWith("1:"))?.slice(2) ?? "{}");
  const madeId = Number(made.image?.src?.match(/\/api\/images\/(\d+)$/)?.[1]);
  check("[미리보기] 생성 성공 + 본인 소유 이미지 + 한도 1회 차감", made.ok && made.image.width === 1024 && made.image.model === "gpt-image-1-mini" && used() === 1
    && db().prepare("select owner_id o from images where id=?").get(madeId)?.o === db().prepare("select id from users where username='qa_alice'").get().id, r.text.slice(-160));
  const sent = readFileSync(process.env.OPENAI_LOG, "utf8").split("\n").filter((l) => l.includes("/images/generations")).at(-1) ?? "";
  check("[미리보기] 이미지 API 요청: 스타일 힌트 + Avoid + low/1024", sent.includes("Photorealistic photograph.") && sent.includes("Avoid: blurry.") && sent.includes('"quality":"low"') && sent.includes('"size":"1024x1024"'), sent.slice(0, 200));
  check("[미리보기] 다른 사람은 미리보기 이미지 못 봄", (await bob.get(made.image.src)).status === 404 && (await alice.get(made.image.src)).status === 200);
  r = await preview(alice, "   ", "photo"); check("[미리보기] 빈 프롬프트 거부", r.text.includes("프롬프트를 먼저 만들어주세요"));
  r = await preview(alice, "x".repeat(4001), "photo"); check("[미리보기] 4000자 초과 거부", r.text.includes("너무 길어요"));
  r = await preview(alice, "a cat", "nope"); check("[미리보기] 잘못된 스타일 거부", r.text.includes("스타일을 선택해주세요"));
  r = await preview(null, "a cat", "photo"); check("[미리보기] 비로그인 → 로그인", r.status === 303 || r.redirect.includes("/login"), `status ${r.status}`);
}

// ---- Saving a picked preview as the v1 result image
{
  const { readdirSync, readFileSync: read } = await import("node:fs");
  const js = readdirSync(".next/static", { recursive: true }).filter((f) => f.endsWith(".js")).map((f) => read(`.next/static/${f}`, "utf8")).join("\n");
  const createId = js.match(/\("([0-9a-f]{40,})",[^)]{0,80}"createRepoAction"/)?.[1];
  const create = async (who, fields) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(`_1_${k}`, v);
    body.set("0", '["$undefined","$K1"]');
    const res = await fetch(BASE + "/new", { method: "POST", redirect: "manual", headers: { cookie: who.cookie, "Next-Action": createId, Accept: "text/x-component" }, body });
    const redirect = res.headers.get("x-action-redirect") ?? "";
    return { id: Number(redirect.match(/\/repos\/(\d+)/)?.[1]), text: await res.text() };
  };
  const repo = (id) => db().prepare("select model, cover_json c from repos where id=?").get(id);
  const v1 = (id) => JSON.parse(db().prepare("select image_json j from commits where repo_id=? order by id limit 1").get(id)?.j ?? "null");
  const aliceImg = db().prepare("select id from images where owner_id=(select id from users where username='qa_alice') order by id limit 1").get().id;
  const src = `/api/images/${aliceImg}`;
  const base = { title: "미리보기 저장", style: "photo", prompt: "a cat on a roof", model: "Flux.1 D", visibility: "private" };
  let r = await create(alice, { ...base, previewImage: src, previewWidth: "1024", previewHeight: "1024", previewModel: "gpt-image-1-mini" });
  check("[미리보기 저장] 고른 미리보기 → v1 결과 + 대표 이미지", v1(r.id)?.src === src && JSON.parse(repo(r.id).c).src === src, r.text.slice(-100));
  check("[미리보기 저장] 모델 = 미리보기 모델", repo(r.id).model === "gpt-image-1-mini");
  check("[미리보기 저장] 크기 저장", v1(r.id)?.width === 1024 && v1(r.id)?.height === 1024);
  r = await create(alice, { ...base, previewImage: src, previewWidth: "abc", previewHeight: "999999", previewModel: "" });
  check("[미리보기 저장] 이상한 크기 보정 + 모델 비면 AI 모델 유지", v1(r.id)?.width === 1024 && v1(r.id)?.height === 10000 && repo(r.id).model === "Flux.1 D");
  r = await create(alice, { ...base, image: PNG, imageWidth: "1", imageHeight: "1" });
  check("[미리보기 저장] 파일 업로드는 무시 (결과 이미지 없음)", !!r.id && v1(r.id) === null);
  r = await create(bob, { ...base, previewImage: src, previewModel: "gpt-image-1-mini" });
  check("[미리보기 저장] 남의 이미지 선택 거부", !r.id && r.text.includes("미리보기 이미지를 찾을 수 없습니다"));
  for (const bad of ["https://example.com/x.png", "/api/images/999999", "/api/images/1/../2", "javascript:alert(1)"]) {
    r = await create(alice, { ...base, previewImage: bad });
    check(`[미리보기 저장] 잘못된 src 거부: ${bad}`, !r.id && r.text.includes("미리보기 이미지를 찾을 수 없습니다"));
  }
  r = await create(alice, base);
  check("[미리보기 저장] 미리보기 없이도 저장 (이미지 없음)", !!r.id && v1(r.id) === null);
}

// ---- Result images rendered for versions without one
{
  const { readdirSync, readFileSync: read } = await import("node:fs");
  const js = readdirSync(".next/static", { recursive: true }).filter((f) => f.endsWith(".js")).map((f) => read(`.next/static/${f}`, "utf8")).join("\n");
  const genId = js.match(/\("([0-9a-f]{40,})",[^)]{0,80}"generateVersionImageAction"/)?.[1];
  const createId = js.match(/\("([0-9a-f]{40,})",[^)]{0,80}"createRepoAction"/)?.[1];
  check("[자동 결과] generateVersionImageAction id", !!genId);
  const gen = async (who, repoId, commitId) => {
    const res = await fetch(BASE + `/repos/${repoId}`, { method: "POST", redirect: "manual", headers: { cookie: who.cookie, "Next-Action": genId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" }, body: JSON.stringify([repoId, commitId]) });
    return { status: res.status, text: await res.text() };
  };
  const create = async (fields) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(`_1_${k}`, v);
    body.set("0", '["$undefined","$K1"]');
    const res = await fetch(BASE + "/new", { method: "POST", redirect: "manual", headers: { cookie: alice.cookie, "Next-Action": createId, Accept: "text/x-component" }, body });
    // Next appends the navigation type, e.g. "/repos/3?autogen=1;push".
    return (res.headers.get("x-action-redirect") ?? "").split(";")[0];
  };
  const commits = (repoId) => db().prepare("select id, image_json j from commits where repo_id=? order by id").all(repoId);
  const neon = db().prepare("select id from repos where name='qa-neon-fox'").get().id;
  const [c1] = commits(neon);
  const coverBefore = db().prepare("select cover_json c from repos where id=?").get(neon).c;

  let r = await alice.get(`/repos/${neon}?v=1`);
  check("[자동 결과] 작성자: 이미지 없는 버전에 생성 버튼", r.html.includes("이 버전으로 결과 이미지 만들기"));
  r = await bob.get(`/repos/${neon}?v=1`);
  check("[자동 결과] 다른 사람에겐 버튼 없음", r.status === 200 && !r.html.includes("이 버전으로 결과 이미지 만들기"));
  r = await gen(bob, neon, c1.id);
  check("[자동 결과] 남의 저장소 생성 차단", commits(neon)[0].j === null, `status ${r.status}`);
  r = await gen(alice, neon, c1.id);
  const img = JSON.parse(commits(neon)[0].j ?? "null");
  check("[자동 결과] v1 결과 이미지 생성 + 생성 모델 기록", r.text.includes('"ok":true') && /^\/api\/images\/\d+$/.test(img?.src) && img.generatedBy === "gpt-image-1-mini", r.text.slice(-120));
  check("[자동 결과] HEAD 가 아닌 버전은 대표 이미지 유지", db().prepare("select cover_json c from repos where id=?").get(neon).c === coverBefore);
  r = await gen(alice, neon, c1.id);
  check("[자동 결과] 이미 이미지 있는 버전 거부", r.text.includes("이미 결과 이미지가 있어요"));
  r = await gen(alice, neon, 999999);
  check("[자동 결과] 없는 버전 거부", r.text.includes("버전을 찾을 수 없습니다"));
  r = await alice.get(`/repos/${neon}?v=1`);
  check("[자동 결과] 화면에 이미지 + '생성한 미리보기' 표시", r.html.includes(`src="${img.src}"`) && r.html.replace(/<!-- -->/g, "").includes("gpt-image-1-mini로 생성한 미리보기"));
  check("[자동 결과] 공개 저장소의 생성 이미지는 비로그인도 열람", (await fetch(BASE + img.src)).status === 200);

  let loc = await create({ title: "자동 생성", style: "anime", prompt: "1girl, silver hair", visibility: "public" });
  const autoRepo = Number(loc.match(/\/repos\/(\d+)/)?.[1]);
  check("[자동 결과] 이미지 없이 저장 → ?autogen=1 로 이동", /\/repos\/\d+\?autogen=1$/.test(loc), loc);
  r = await gen(alice, autoRepo, commits(autoRepo)[0].id);
  const headImg = JSON.parse(commits(autoRepo)[0].j ?? "null");
  check("[자동 결과] HEAD 결과 생성 → 대표 이미지 + 피드 카드", JSON.parse(db().prepare("select cover_json c from repos where id=?").get(autoRepo).c ?? "null")?.src === headImg?.src && (await bob.get("/")).html.includes(`src="${headImg?.src}"`));
  loc = await create({ title: "이미지 있음", style: "photo", prompt: "a cat", visibility: "private", previewImage: seedImage("qa_alice") });
  check("[자동 결과] 미리보기 골라 저장하면 autogen 없음", /\/repos\/\d+$/.test(loc), loc);
  r = await alice.submit(`/repos/${autoRepo}?edit=1`, 'name="repoId"', { prompt: "1girl, silver hair, smile", message: "미소" });
  check("[자동 결과] 이미지 없이 커밋 → ?autogen=1", r.status === 303 && /\?autogen=1$/.test(r.location ?? ""), r.location);
}

// ---- Followers / following in a modal
{
  const guest = new Browser();
  const strip = (h) => h.replace(/<!-- -->/g, "");
  let r = await alice.get("/me");
  let t = strip(r.html);
  check("[팔로우 모달] 마이페이지 탭에서 팔로워/팔로잉 제거", !/>팔로워 · \d/.test(t) && !/>팔로잉 · \d/.test(t) && t.includes("좋아요 · "));
  check("[팔로우 모달] 아이디 밑 숫자가 모달 링크", r.html.includes('href="/me?follows=followers"') && r.html.includes('href="/me?follows=following"'));
  check("[팔로우 모달] 평소엔 모달 없음", !r.html.includes('role="dialog"'));
  check("[마이페이지] 아이디 위 My page 문구 없음", !r.html.includes(">My page</p>") && r.html.includes("@qa_alice"));
  check("[마이페이지] 공개 프로필 보기 링크 없음", !t.includes("공개 프로필 보기") && !r.html.includes('href="/u/qa_alice"'));
  r = await alice.get("/me?follows=followers");
  t = strip(r.html);
  check("[팔로우 모달] 팔로워 모달 + 목록", r.html.includes('role="dialog"') && r.html.includes('aria-modal="true"') && t.includes("@qa_alice · 팔로워") && t.includes("@qa_bob"));
  check("[팔로우 모달] 닫기 링크 = /me", /href="\/me"[^>]*aria-label="닫기"|aria-label="닫기"[^>]*href="\/me"/.test(r.html));
  r = await alice.get("/me?tab=likes&follows=following");
  check("[팔로우 모달] 다른 탭에서 열면 닫을 때 탭 유지", /href="\/me\?tab=likes"[^>]*aria-label="닫기"|aria-label="닫기"[^>]*href="\/me\?tab=likes"/.test(r.html) && strip(r.html).includes("아직 팔로우하는 사람이 없어요."));
  r = await alice.get("/me?tab=followers");
  check("[팔로우 모달] 예전 ?tab=followers 링크는 모달로", r.html.includes('role="dialog"') && strip(r.html).includes("@qa_bob"));
  r = await alice.get("/me?follows=nope");
  check("[팔로우 모달] 잘못된 값은 모달 없음", r.status === 200 && !r.html.includes('role="dialog"'));
  r = await guest.get("/u/qa_alice?follows=followers");
  check("[팔로우 모달] 공개 프로필에서도 모달 (비로그인)", r.html.includes('role="dialog"') && strip(r.html).includes("@qa_bob") && r.html.includes('href="/u/qa_alice?follows=following"'));
  r = await guest.get("/u/qa_carol?follows=following");
  check("[팔로우 모달] 다른 사람 빈 목록 문구", strip(r.html).includes("아직 팔로우하는 사람이 없어요."));
}

// ---- Author links, no "Civitai" label next to names
{
  const post = POSTS[0];
  let r = await bob.get(`/p/${post.id}`);
  const t = r.html.replace(/<!-- -->/g, "");
  const href = `https://civitai.com/user/${encodeURIComponent(post.author)}`;
  check("[작성자] Civitai 게시물 작성자 → Civitai 프로필 새 탭", new RegExp(`href="${href.replace(/[.?*+^$()|[\]\\]/g, "\\$&")}"[^>]*target="_blank"`).test(r.html) && t.includes(`@${post.author}</a>`));
  check("[작성자] 작성자 옆 Civitai 문구 없음", !/@[^<]*<\/a> · Civitai/.test(t) && !t.includes("· Civitai ♥"));
  check("[작성자] 원본 보기 링크는 유지", t.includes("원본 보기 · Civitai ↗"));
  r = await bob.get("/me?tab=likes");
  check("[작성자] 좋아요 목록 메타에 Civitai 없음", !r.html.replace(/<!-- -->/g, "").includes(" · Civitai"));
  const repo = db().prepare("select id from repos where name='qa-neon-fox'").get().id;
  r = await bob.get(`/repos/${repo}`);
  check("[작성자] PromHub 저장소 작성자 → /u/ 페이지", r.html.includes('href="/u/qa_alice"'));
}

// ---- Editing a version by chatting
{
  const { readdirSync, readFileSync: read } = await import("node:fs");
  const js = readdirSync(".next/static", { recursive: true }).filter((f) => f.endsWith(".js")).map((f) => read(`.next/static/${f}`, "utf8")).join("\n");
  const chatId = js.match(/\("([0-9a-f]{40,})",[^)]{0,80}"chatPromptBuilder"/)?.[1];
  const repo = db().prepare("select id from repos where name='qa-neon-fox'").get().id;
  const head = () => db().prepare("select id, message, prompt, image_json j from commits where repo_id=? order by id desc limit 1").get(repo);
  const n = db().prepare("select count(*) c from commits where repo_id=?").get(repo).c;
  let r = await alice.get(`/repos/${repo}?edit=1`);
  const t = r.html.replace(/<!-- -->/g, "");
  check("[대화 수정] 수정 화면 = 채팅 (텍스트 입력칸 없음)", t.includes("AI 에이전트와 대화로 수정하기") && !r.html.includes('<textarea name="prompt"') && r.html.includes('placeholder="메시지 입력'));
  check("[대화 수정] 현재 버전이 첫 초안으로", t.includes(`지금 v${n} 프롬프트예요`) && t.includes(`현재 v${n}`));
  check("[대화 수정] 저장값 = 현재 프롬프트, 바뀌기 전엔 커밋 비활성", r.html.includes(`name="prompt" value="${head().prompt.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}"`) && /<button type="submit" disabled=""[^>]*>커밋/.test(r.html));
  const chat = async (context) => {
    const res = await fetch(BASE + `/repos/${repo}`, { method: "POST", headers: { cookie: alice.cookie, "Next-Action": chatId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
      body: JSON.stringify([[], "배경을 밤으로 바꿔줘", [], context]) });
    return res.text();
  };
  const base = head().prompt;
  let out = await chat({ model: "Flux.1 D", style: "illustration", base });
  const sent = readFileSync(process.env.OPENAI_LOG, "utf8").split("\n").filter((l) => l.includes("/responses")).at(-1) ?? "";
  check("[대화 수정] AI 에 수정 모드 + 현재 프롬프트 전달", out.includes('"ok":true') && sent.includes("Editing mode") && sent.includes(base.split("\n")[0].slice(0, 40)), sent.slice(0, 100));
  out = await chat({ model: "Flux.1 D", style: "illustration", base: "x".repeat(4001) });
  check("[대화 수정] 너무 긴 base 거부", out.includes("수정할 프롬프트가 올바르지 않아요"));
  out = await chat({ model: "Flux.1 D", style: "illustration" });
  const plain = readFileSync(process.env.OPENAI_LOG, "utf8").split("\n").filter((l) => l.includes("/responses")).at(-1) ?? "";
  check("[대화 수정] 새 프롬프트 대화엔 수정 모드 없음", out.includes('"ok":true') && !plain.includes("Editing mode"));
  // Commit the chat result with a picked preview as its result image.
  const img = `/api/images/${db().prepare("select id from images where owner_id=(select id from users where username='qa_alice') order by id limit 1").get().id}`;
  r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: base + ", night sky", message: "배경을 밤으로", previewImage: img, previewWidth: "1024", previewHeight: "1024", previewModel: "gpt-image-1-mini" });
  const c = head(); const ci = JSON.parse(c.j ?? "null");
  check("[대화 수정] 커밋 + 고른 미리보기가 새 버전 결과 이미지", r.status === 303 && c.message === "배경을 밤으로" && c.prompt.endsWith("night sky") && ci?.src === img && ci?.generatedBy === "gpt-image-1-mini" && !/autogen/.test(r.location ?? ""), r.location);
  r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: c.prompt, message: "같은 프롬프트 + 미리보기", previewImage: img });
  check("[대화 수정] 프롬프트 그대로여도 미리보기만으로 새 버전", r.status === 303 && head().message === "같은 프롬프트 + 미리보기");
  r = await bob.submit(`/repos/${db().prepare("select id from repos where owner_id=(select id from users where username='qa_bob') limit 1").get().id}?edit=1`, 'name="repoId"', { prompt: "x", message: "남의 미리보기", previewImage: img });
  check("[대화 수정] 남의 미리보기 이미지로 커밋 거부", r.html.includes("미리보기 이미지를 찾을 수 없습니다"));
}

// ---- Commit message from the chat (no message field)
{
  const repo = db().prepare("select id from repos where name='qa-neon-fox'").get().id;
  const head = () => db().prepare("select message, prompt from commits where repo_id=? order by id desc limit 1").get(repo);
  let r = await alice.get(`/repos/${repo}?edit=1`);
  check("[커밋 메시지] 입력칸 없음 (숨은 값만)", !r.html.replace(/<!-- -->/g, "").includes("Commit message") && /<input type="hidden" name="message" value=""/.test(r.html));
  const base = head().prompt;
  r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: base + ", rain", message: "" });
  check("[커밋 메시지] 메시지 없이 프롬프트 수정 → '프롬프트 수정'", r.status === 303 && head().message === "프롬프트 수정");
  const img = `/api/images/${db().prepare("select id from images where owner_id=(select id from users where username='qa_alice') order by id limit 1").get().id}`;
  r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: head().prompt, message: "", previewImage: img });
  check("[커밋 메시지] 이미지만 추가 → '결과 이미지 추가'", r.status === 303 && head().message === "결과 이미지 추가");
  r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: head().prompt + ", fog", message: "은발로 바꿔줘 · 배경을 밤으로" });
  check("[커밋 메시지] 채팅 요청이 메시지로", head().message === "은발로 바꿔줘 · 배경을 밤으로");
  r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: head().prompt + ", mist", message: "가".repeat(500) });
  check("[커밋 메시지] 200자로 자름", head().message.length === 200);
}

// ---- Repo page uses the post page layout
{
  const repo = db().prepare("select id from repos where name='qa-neon-fox'").get().id;
  const post = POSTS[0];
  const [rp, pp] = [await bob.get(`/repos/${repo}`), await bob.get(`/p/${post.id}`)];
  const shell = (h) => h.match(/<main class="([^"]*)"/)?.[1];
  check("[레이아웃] 저장소·게시물 같은 2단 레이아웃", shell(rp.html) === shell(pp.html) && shell(rp.html)?.includes("lg:grid-cols-[minmax(0,1fr)_420px]"), shell(rp.html));
  const aside = rp.html.slice(rp.html.indexOf("<aside"));
  check("[레이아웃] 오른쪽: 스타일·제목·작성자·버튼·모델·프롬프트·히스토리", ["<h1", 'href="/u/qa_alice"', "Fork", "사용 모델", ">Copy<", "History"].every((x) => aside.includes(x)));
  check("[레이아웃] Fork 영역 최소 너비 (좁으면 다음 줄로)", (rp.html.match(/<div class="min-w-64 flex-1">/g) ?? []).length === 1 && (pp.html.match(/<div class="min-w-64 flex-1">/g) ?? []).length === 1);
  check("[레이아웃] Fork 버튼 한 줄 (줄바꿈 금지)", /class="btn-mint w-full whitespace-nowrap/.test(rp.html) && /class="btn-mint w-full whitespace-nowrap/.test(pp.html));
  const own = await alice.get(`/repos/${repo}`);
  const ownAside = own.html.slice(own.html.indexOf("<aside"));
  check("[레이아웃] 작성자: 좋아요·공개 전환·수정하기, Fork 없음", ownAside.includes("수정하기") && ownAside.includes("누르면 비공개로 전환") && !ownAside.includes("Fork —"));
}

console.log(`\n기능 QA: ${pass}개 통과, ${fail}개 실패`);
process.exitCode = fail ? 1 : 0;
