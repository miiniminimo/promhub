import { readFileSync } from "node:fs";
import { CHALLENGES, grade, scoreOf } from "../src/lib/challenges.ts";
import { joinNegative, previewPrompt, splitNegative, usesNegativePrompt } from "../src/lib/prompt-format.ts";
import { safeNextPath } from "../src/lib/safe-redirect.ts";
import { matchesQuery, searchQuery } from "../src/lib/feed-search.ts";
import { diffPrompt, diffStats } from "../src/lib/prompt-diff.ts";
import { timeAgo } from "../src/lib/time-ago.ts";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, info = "") => { if (ok) pass++; else fail++; if (!ok) console.log(`FAIL ${name} ${info}`); };

// 1) Every prompt-test problem is solvable, and an empty answer is not.
const answers: Record<string, string> = {
  "role-translator": "너는 한국어→영어 전문 번역가야. 아래 문장을 번역하고, 설명 없이 번역 결과만 출력해.\n\n{{text}}",
  "json-summary": "다음 기사를 정확히 3개의 문장으로 요약해. 서론 없이 JSON만 출력하고, 키는 summary 로 해.\n{{article}}",
  "product-photo": "Advertising product photo of a matte black wireless earbud case, softbox lighting with blue rim light, 100mm macro lens, on wet concrete surface background, --ar 4:5",
  "few-shot-sentiment": "리뷰를 긍정 또는 부정으로 분류해. 라벨만 출력해.\n입력: 배송 빨라요 → 긍정\n입력: 화면이 깨졌어요 → 부정\n리뷰: {{review}}",
  "math-tutor": "당신은 초등 수학 선생님입니다. 아래 문제를 단계별로 차근차근 풀이하세요. 풀이 과정을 모두 보여준 다음, 최종 답만 <answer></answer> 태그 안에 넣으세요. 문제 조건이 부족하거나 풀 수 없는 문제라면 모르는 이유를 설명하고 <answer>풀 수 없음</answer> 이라고 답하세요.\n문제: {{problem}}",
  "brand-persona": "너는 카페 모닝빈의 SNS 담당자야. 말투는 친근한 존댓말, 이모지는 1개까지. 메뉴나 가격처럼 모르면 지어내지 말고 매장에 문의해 달라고 안내해.\n질문: {{question}}",
  "anime-character-tags": "masterpiece, best quality, 1girl, silver hair, blue eyes, school uniform, cherry blossoms, outdoors\nNegative prompt: lowres, bad anatomy, watermark",
  "meeting-minutes": "아래 회의 녹취록에서 결정사항과 할 일을 정리해 주세요. 출력은 마크다운 표 두 개로 구분합니다: 첫 번째 표는 결정사항, 두 번째 표는 할 일(내용, 담당자, 기한)입니다. 담당자나 기한이 언급되지 않았다면 미정이라고 적으세요. 녹취록에 없는 내용은 절대 추가하지 말고, 추측도 하지 마세요. 같은 할 일이 여러 번 나오면 하나로 합치세요.\n\n녹취록:\n{{transcript}}",
};
for (const c of CHALLENGES) {
  const r = grade(answers[c.slug] ?? "", c.tests);
  check(`${c.slug} 모범답안 100점`, scoreOf(r) === 100, r.filter((x) => !x.passed).map((x) => x.label).join(","));
  check(`${c.slug} 빈 답안 <100`, scoreOf(grade("", c.tests)) < 100);
}
check("문제 slug 중복 없음", new Set(CHALLENGES.map((c) => c.slug)).size === CHALLENGES.length);

// 2) Redirect safety.
const redirects: [unknown, string][] = [["/me", "/me"], ["/repos/3?v=2", "/repos/3?v=2"], ["https://example.org", "/"], ["//example.org", "/"],
  ["/\\example.com", "/"], ["\\\\example.com", "/"], ["javascript:alert(1)", "/"], ["/\texample.com", "/"], ["/\nx", "/"], ["", "/"], [null, "/"], [["/me"], "/"]];
for (const [input, want] of redirects) check(`safeNextPath(${JSON.stringify(input)})`, safeNextPath(input) === want, `→ ${safeNextPath(input)}`);

// 3) Prompt format.
check("joinNegative 없음", joinNegative("a", null) === "a");
check("joinNegative 공백", joinNegative("a", "  ") === "a");
check("joinNegative 줄 추가", joinNegative("a ", " b") === "a\nNegative prompt: b");
for (const m of ["SDXL 1.0", "Pony", "Illustrious", "NoobAI", "SD 1.5"]) check(`SD 계열 ${m}`, usesNegativePrompt(m));
for (const m of ["Flux.1 D", "OpenAI", "Imagen4", "Krea 2", "Midjourney v7"]) check(`비 SD ${m}`, !usesNegativePrompt(m));

// 4) Offline keyword table (read from the source; the module itself is server-only).
const src = readFileSync(new URL("../src/lib/server/prompt-builder.ts", import.meta.url), "utf8");
const table = [...src.matchAll(/\[\/(.+?)\/, "(.+?)"\],/g)].map(([, re, en]) => [new RegExp(re), en] as const);
const tr = (t: string) => table.filter(([re]) => re.test(t)).map(([, e]) => e);
check("키워드 표 로드", table.length > 50, `${table.length}개`);
check("은발→silver hair", tr("은발에 미소").includes("silver hair"));
check("아웃포커스≠미소", !tr("85mm 아웃포커스").includes("gentle smile"));
check("비비드≠rain", !tr("비비드한 색감").includes("rain"));
check("비 오는→rain", tr("비 오는 밤").includes("rain"));
check("SCRIPTS 예시 6개", (src.match(/^\s{2}"[^"]+": \{\n\s+subject:/gm) ?? []).length === 6);

// 5) Feed search.
check("검색 AND", matchesQuery("cat window", ["A cat by the", "window"]) && !matchesQuery("cat dog", ["a cat"]));
check("검색 대소문자", matchesQuery("FLUX", ["Flux.1 D"]));
check("검색 한글", matchesQuery("고양이", ["창가의 고양이"]));
check("검색어 정리", searchQuery(["  a ", "b"]) === "a" && searchQuery(undefined) === "" && searchQuery("x".repeat(500)).length === 100);

// 6) Prompt diff.
{
  const join = (parts: { type: string; text: string }[], skip: string) => parts.filter((p) => p.type !== skip).map((p) => p.text).join("");
  const cases: [string, string][] = [["a, b, c", "a, c, d"], ["A photo of a cat", "A photo of a dog at night"], ["", "x"], ["x", ""], ["same, text", "same, text"],
    ["line one,\nNegative prompt: x", "line one, more,\nNegative prompt: x, y"], ["가, 나, 다", "다, 나, 가"]];
  for (const [a, b] of cases) {
    const d = diffPrompt(a, b);
    check(`diff 복원 ${JSON.stringify([a, b])}`, join(d, "del") === b && join(d, "add").replace(/[,\s]/g, "") === a.replace(/[,\s]/g, ""), JSON.stringify(d));
  }
  check("diff 동일 → 변경 0", diffStats(diffPrompt("a, b", "a, b")).added === 0);
  check("diff 태그 2개 추가 → +2", JSON.stringify(diffStats(diffPrompt("a, b", "a, b, c, d"))) === '{"added":2,"removed":0}');
  check("diff 단어 교체", JSON.stringify(diffPrompt("a red car", "a blue car")) === JSON.stringify([{ type: "same", text: "a " }, { type: "del", text: "red " }, { type: "add", text: "blue " }, { type: "same", text: "car" }]));
  const big = Array.from({ length: 3000 }, (_, i) => `t${i}`).join(", ");
  const t0 = Date.now(); diffPrompt(big, big + ", x"); check("diff 큰 입력 1초 이내", Date.now() - t0 < 1000, `${Date.now() - t0}ms`);
}

// 7) Relative time.
{
  const now = Date.parse("2026-10-21T12:00:00Z");
  const ago = (ms: number) => timeAgo(new Date(now - ms).toISOString(), now);
  check("timeAgo 방금", ago(30_000) === "방금");
  check("timeAgo 분", ago(5 * 60_000) === "5분 전");
  check("timeAgo 시간", ago(3 * 3600_000) === "3시간 전");
  check("timeAgo 일", ago(2 * 864e5) === "2일 전");
  check("timeAgo 30일 이상 날짜", /2026/.test(ago(40 * 864e5)));
}

// 8) Negative split + preview prompt.
{
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  check("splitNegative 없음", eq(splitNegative("a, b"), { prompt: "a, b", negative: null }));
  check("splitNegative 있음", eq(splitNegative("a, b\nNegative prompt: x, y"), { prompt: "a, b", negative: "x, y" }));
  check("splitNegative 여러 줄 본문", eq(splitNegative("l1\nl2\nNegative prompt: z"), { prompt: "l1\nl2", negative: "z" }));
  check("splitNegative 빈 negative", eq(splitNegative("a\nNegative prompt:   "), { prompt: "a", negative: null }));
  check("splitNegative ↔ joinNegative", eq(splitNegative(joinNegative("p q", "n m")), { prompt: "p q", negative: "n m" }));
  const pp = previewPrompt("1girl, silver hair\nNegative prompt: lowres, watermark", "anime");
  check("미리보기 프롬프트: 스타일 + 본문 + Avoid", pp.startsWith("Anime illustration") && pp.includes("1girl, silver hair") && pp.endsWith("Avoid: lowres, watermark.") && !pp.includes("Negative prompt"));
  check("미리보기 프롬프트: negative 없으면 Avoid 없음", !previewPrompt("a cat", "photo").includes("Avoid"));
}

console.log(`\n단위 테스트: ${pass}개 통과, ${fail}개 실패`);
process.exitCode = fail ? 1 : 0;
