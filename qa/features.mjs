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
const PNG = new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")], "result.png", { type: "image/png" });
const SVG = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], "x.svg", { type: "image/svg+xml" });
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
  check("[비교] v1 → v2 화면", r.status === 200 && t.includes("v1 → v2") && t.includes("프롬프트 보기") && !t.includes(">Copy<"));
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
  let r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: before.prompt, message: "결과 이미지 추가", image: PNG, imageWidth: "640", imageHeight: "999999" });
  const after = head(); const img = JSON.parse(after.image_json ?? "null");
  check("[결과이미지] 프롬프트 그대로 + 이미지만으로 새 버전", r.status === 303 && after.id !== before.id && after.prompt === before.prompt && after.message === "결과 이미지 추가");
  check("[결과이미지] 이미지 저장 + 크기 (높이 10000 으로 제한)", /^\/api\/images\/\d+$/.test(img?.src) && img.width === 640 && img.height === 10000, JSON.stringify(img));
  const cover = JSON.parse(db().prepare("select cover_json c from repos where id=?").get(repo).c ?? "null");
  check("[결과이미지] 저장소 대표 이미지 = 최신 결과", cover?.src === img?.src);
  const file = await fetch(BASE + img.src); check("[결과이미지] 이미지 응답 PNG", file.status === 200 && file.headers.get("content-type") === "image/png");
  r = await get(`/repos/${repo}`);
  const t = r.html.replace(/<!-- -->/g, "");
  check("[결과이미지] HEAD 화면에 결과 이미지", t.includes("v3 결과 이미지") && r.html.includes(`src="${img.src}"`));
  check("[결과이미지] 히스토리 썸네일", (r.html.match(new RegExp(`src="${img.src}"`, "g")) ?? []).length >= 2);
  r = await get(`/repos/${repo}?v=2`);
  check("[결과이미지] 이미지 없는 버전은 이미지 영역 없음", r.status === 200 && !r.html.replace(/<!-- -->/g, "").includes("v2 결과 이미지"));
  r = await get(`/repos/${repo}?v=3&diff=2`);
  const d = r.html.replace(/<!-- -->/g, "");
  check("[결과이미지] 비교 화면 전/후 이미지", d.includes("v2 결과") && d.includes("v3 결과") && d.includes("결과 이미지 없음"));
  check("[결과이미지] 프롬프트 동일 → +0 −0", d.includes("두 버전의 프롬프트가 같습니다"));
  r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: before.prompt + ", svg", message: "svg", image: SVG });
  check("[결과이미지] SVG 거부", r.status === 200 && r.html.includes("JPG·PNG·GIF·WEBP") && head().message !== "svg");
  const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
  r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: before.prompt + ", big", message: "big", image: big });
  check("[결과이미지] 5MB 초과 거부", r.html.includes("5MB") && head().message !== "big");
  r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: before.prompt, message: "no-op" });
  check("[결과이미지] 이미지·프롬프트 모두 그대로면 거부", r.html.includes("달라진 내용이 없습니다") && head().message !== "no-op");
  const own = db().prepare("select id from repos where owner_id=(select id from users where username='qa_bob') limit 1").get();
  r = await bob.submit(`/repos/${own.id}?edit=1`, 'name="repoId"', { repoId: String(repo), prompt: "x", message: "hack-img", image: PNG });
  check("[결과이미지] 남의 저장소에 이미지 커밋 차단", head().message !== "hack-img");
  r = await alice.get(`/repos/${repo}?edit=1`);
  check("[결과이미지] 커밋 폼에 이미지 입력", r.html.includes('name="image"') && r.html.includes("이 버전의 결과 이미지"));
  r = await get("/");
  check("[결과이미지] 피드 카드가 최신 결과 이미지로", r.html.includes(`src="${img.src}"`));
}

// ---- PR4: images of private repos
{
  const guest = new Browser();
  const repo = db().prepare("select id from repos where owner_id=(select id from users where username='qa_alice') and visibility='private' limit 1").get().id;
  const head = db().prepare("select prompt from commits where repo_id=? order by id desc limit 1").get(repo).prompt;
  let r = await alice.submit(`/repos/${repo}?edit=1`, 'name="repoId"', { prompt: head + ", secret", message: "비공개 결과", image: PNG });
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

console.log(`\n기능 QA: ${pass}개 통과, ${fail}개 실패`);
process.exitCode = fail ? 1 : 0;
