// End-to-end QA against a running server: real HTML forms submitted the way a browser without JS would.
import Database from "better-sqlite3";
const BASE = process.env.BASE, DB = process.env.DB;
let pass = 0, fail = 0;
const check = (name, ok, info = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? `  — ${info}` : ""}`); };
const db = () => new Database(DB, { readonly: true });
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

class Browser {
  cookie = "";
  async req(path, init = {}) {
    const t = Date.now();
    const res = await fetch(BASE + path, { ...init, redirect: "manual", headers: { ...(init.headers ?? {}), cookie: this.cookie }, signal: AbortSignal.timeout(8000) }).catch((e) => ({ status: 0, error: e.name, headers: new Headers(), text: async () => "" }));
    const set = res.headers.get("set-cookie");
    if (set) { const m = set.match(/promhub_session=([^;]*)/); if (m) this.cookie = m[1] ? `promhub_session=${m[1]}` : ""; }
    return { status: res.status, location: res.headers.get("location"), html: await res.text(), ms: Date.now() - t, error: res.error };
  }
  get(path) { return this.req(path); }
  /** Submits the <form> on `path` whose markup contains `marker`, with `fields` added. */
  async submit(path, marker, fields = {}) {
    const page = await this.get(path);
    const form = [...page.html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].find((m) => m[0].includes(marker));
    if (!form) return { status: -1, html: "", location: null, ms: 0, missing: marker };
    const body = new FormData();
    for (const m of form[1].matchAll(/<input([^>]*?)\/?>/g)) {
      const name = m[1].match(/name="([^"]*)"/)?.[1]; if (!name) continue;
      const type = m[1].match(/type="([^"]*)"/)?.[1] ?? "text";
      if (type === "hidden") body.set(decode(name), decode(m[1].match(/value="([^"]*)"/)?.[1] ?? ""));
    }
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    return this.req(path, { method: "POST", body });
  }
}

const guest = new Browser(), alice = new Browser(), bob = new Browser();
const postId = JSON.parse((await import("node:fs")).readFileSync(new URL("../src/data/civitai.json", import.meta.url))).at(0).id;

// --- 3. HTTP
const expect = { "/": 200, "/tests": 200, "/tests?level=2&sort=rate": 200, "/tests/role-translator": 200, "/tests/nope": 404, [`/p/${postId}`]: 200, "/p/nope": 404,
  "/repos/abc": 404, "/repos/999": 404, "/u/nobody": 404, "/api/images/abc": 404, "/login": 200, "/signup": 200, "/demo": 404 };
for (const [path, code] of Object.entries(expect)) { const r = await guest.get(path); check(`GET ${path} → ${code}`, r.status === code, `실제 ${r.status}`); }
for (const path of ["/me", "/new"]) { const r = await guest.get(path); check(`비로그인 ${path} → 로그인`, r.status === 307 && r.location?.includes("/login?next="), r.location); }

// --- 4a. Sign-up / login
const bad = [["ab", "pw-123456", "pw-123456", "아이디는"], ["qa_alice", "123", "123", "6자"], ["qa_alice", "pw-123456", "pw-999999", "일치하지"]];
for (const [u, p, c, msg] of bad) { const r = await guest.submit("/signup", 'name="username"', { username: u, password: p, passwordConfirm: c }); check(`가입 검증: ${msg}`, r.status === 200 && r.html.includes(msg)); }
let r = await alice.submit("/signup?next=%2Fme", 'name="username"', { username: "QA_Alice", password: "qa-pass-1234", passwordConfirm: "qa-pass-1234" });
check("alice 가입 + 소문자 정규화", r.status === 303 && !!alice.cookie && !!db().prepare("select 1 from users where username='qa_alice'").get());
r = await bob.submit("/signup", 'name="username"', { username: "qa_bob", password: "qa-pass-5678", passwordConfirm: "qa-pass-5678" });
check("bob 가입", r.status === 303 && !!bob.cookie);
r = await guest.submit("/signup", 'name="username"', { username: "qa_alice", password: "qa-pass-1234", passwordConfirm: "qa-pass-1234" });
check("중복 아이디 차단", r.html.includes("이미 사용 중"));
r = await guest.submit("/login", 'name="username"', { username: "qa_alice", password: "wrong-pass" });
check("잘못된 비밀번호 + 아이디 유지", r.html.includes("올바르지 않습니다") && r.html.includes('value="qa_alice"'));
const evil = new Browser();
r = await evil.submit("/login?next=%2F%5Cexample.com", 'name="username"', { username: "qa_alice", password: "qa-pass-1234" });
check("로그인 next=/\\example.com 차단", r.status === 303 && !String(r.location).includes("example.com"), r.location);
r = await alice.get("/login?next=https%3A%2F%2Fexample.org");
check("로그인 상태 /login?next=외부 차단", r.status === 307 && r.location?.endsWith("/me"), r.location);

// --- 4b. Repos: fork, commit, visibility, permissions
r = await alice.submit(`/p/${postId}`, "Fork");
const aliceRepo = Number(r.location?.match(/\/repos\/(\d+)/)?.[1]);
check("alice 게시물 포크 → 비공개 저장소", r.status === 303 && db().prepare("select visibility from repos where id=?").get(aliceRepo)?.visibility === "private", r.location);
r = await bob.get(`/repos/${aliceRepo}`); check("bob: alice 비공개 저장소 404", r.status === 404);
r = await alice.submit(`/repos/${aliceRepo}?edit=1`, 'name="repoId"', { prompt: "   ", message: "x" });
check("빈 프롬프트 커밋 → 오류 + 서버 멈춤 없음", r.status === 200 && r.html.includes("프롬프트를 입력해주세요") && r.ms < 3000, `${r.ms}ms`);
const head = db().prepare("select prompt from commits where repo_id=? order by id desc limit 1").get(aliceRepo).prompt;
r = await alice.submit(`/repos/${aliceRepo}?edit=1`, 'name="repoId"', { prompt: head, message: "x" });
check("변경 없는 커밋 거부", r.html.includes("달라진 내용이 없습니다") && r.ms < 3000, `${r.ms}ms`);
r = await alice.submit(`/repos/${aliceRepo}?edit=1`, 'name="repoId"', { prompt: head.replace(/\n/g, "\r\n") + "\r\nfilm grain", message: "필름 질감 추가" });
const last = db().prepare("select message, prompt from commits where repo_id=? order by id desc limit 1").get(aliceRepo);
check("커밋 성공 + CRLF 정규화", r.status === 303 && last.message === "필름 질감 추가" && !last.prompt.includes("\r"));
r = await alice.submit(`/repos/${aliceRepo}`, "누르면 공개로 전환");
check("공개 전환", db().prepare("select visibility from repos where id=?").get(aliceRepo).visibility === "public");
r = await bob.get(`/repos/${aliceRepo}`);
check("bob: 공개 저장소 열람 + 편집 UI 없음", r.status === 200 && !r.html.includes("?edit=1") && r.html.includes("Fork"));
r = await bob.submit(`/repos/${aliceRepo}`, "Fork");
const bobFork = Number(r.location?.match(/\/repos\/(\d+)/)?.[1]);
const fk = db().prepare("select forked_repo_id, visibility, forked_post_id from repos where id=?").get(bobFork);
check("bob 저장소 포크", fk?.forked_repo_id === aliceRepo && fk.visibility === "private" && fk.forked_post_id === null);
// bob uses the commit form of his own fork but swaps in alice's repo id.
r = await bob.submit(`/repos/${bobFork}?edit=1`, 'name="repoId"', { repoId: String(aliceRepo), prompt: "hacked", message: "hack" });
check("bob → alice 저장소 커밋 차단 (repoId 조작)", r.status !== -1 && db().prepare("select count(*) c from commits where repo_id=? and message='hack'").get(aliceRepo).c === 0, `status ${r.status}`);
r = await guest.get("/");
check("피드에 포크 저장소 미노출", !r.html.includes(`href="/repos/${aliceRepo}"`) && !r.html.includes(`href="/repos/${bobFork}"`));

// --- 4c. Follow / like
r = await bob.submit("/u/qa_alice", "Follow");
check("bob → alice 팔로우", !!db().prepare("select 1 from follows f join users a on a.id=f.follower_id join users b on b.id=f.followee_id where a.username='qa_bob' and b.username='qa_alice'").get());
r = await alice.get("/u/qa_alice"); check("본인 프로필엔 팔로우 버튼 없음", r.html.includes("My Page") && !r.html.includes(">Follow<"));
r = await bob.submit(`/repos/${aliceRepo}`, "좋아요"); r = await bob.submit(`/p/${postId}`, "좋아요");
check("bob 좋아요 2건 (저장소·게시물)", db().prepare("select count(*) c from likes l join users u on u.id=l.user_id where u.username='qa_bob'").get().c === 2);
r = await bob.get("/me?tab=likes");
check("마이페이지 좋아요 탭 2개", (r.html.replace(/<!-- -->/g, "").match(/저장됨 · /g) ?? []).length === 2);
r = await alice.get("/me?tab=followers"); check("alice 팔로워 탭에 @qa_bob", r.html.includes("@<!-- -->qa_bob") || r.html.includes("@qa_bob"));
r = await bob.submit("/me?tab=likes", "저장됨");
check("좋아요 탭에서 해제", db().prepare("select count(*) c from likes l join users u on u.id=l.user_id where u.username='qa_bob'").get().c === 1);
r = await alice.submit(`/repos/${aliceRepo}`, "누르면 비공개로 전환");
r = await bob.get("/me?tab=likes");
check("비공개로 바뀐 저장소는 좋아요 목록에서 제외", !r.html.includes(`href="/repos/${aliceRepo}"`));

// --- 4d. Images
r = await guest.get("/api/images/1"); check("이미지 없음 404", r.status === 404);

console.log(`\nE2E: ${pass}개 통과, ${fail}개 실패`);
process.exitCode = fail ? 1 : 0;
