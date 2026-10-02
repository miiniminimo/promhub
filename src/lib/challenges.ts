// Prompt test problems, graded by static checks on the submitted prompt.
// (MVP: no LLM call — each test inspects the prompt text itself.)

export type TestCase =
  | { kind: "includes"; label: string; any: string[] }
  | { kind: "regex"; label: string; pattern: string; min?: number }
  | { kind: "placeholder"; label: string; name: string }
  | { kind: "maxLength"; label: string; value: number }
  | { kind: "minLength"; label: string; value: number };

export type Challenge = {
  slug: string;
  level: 1 | 2 | 3;
  title: string;
  category: string;
  description: string;
  tests: TestCase[];
};

export type TestResult = { label: string; passed: boolean; detail: string };

export const CHALLENGES: Challenge[] = [
  {
    slug: "role-translator",
    level: 1,
    title: "역할 부여하기: 번역가",
    category: "기본기",
    description: `AI에게 **한국어 → 영어 번역가** 역할을 부여하는 시스템 프롬프트를 작성하세요.

### 요구사항
- AI의 역할을 명확히 정의해야 합니다.
- 번역할 원문은 \`{{text}}\` 변수로 전달됩니다.
- 번역 결과 **외의 설명은 출력하지 않도록** 지시해야 합니다.
- 프롬프트는 400자 이하로 작성합니다.

### 예시 입력
\`{{text}}\` = "오늘 회의는 3시로 미뤄졌어요."

### 기대 출력
The meeting today has been pushed to 3 PM.`,
    tests: [
      { kind: "includes", label: "역할 정의", any: ["you are", "너는", "당신은", "역할", "act as"] },
      { kind: "includes", label: "번역 작업 명시", any: ["번역", "translat"] },
      { kind: "placeholder", label: "{{text}} 변수 사용", name: "text" },
      { kind: "includes", label: "부가 설명 금지", any: ["only", "만 출력", "설명 없이", "설명하지", "without explanation"] },
      { kind: "maxLength", label: "400자 이하", value: 400 },
    ],
  },
  {
    slug: "json-summary",
    level: 1,
    title: "출력 형식 지정: 3줄 요약 JSON",
    category: "출력 제어",
    description: `기사 원문을 **정확히 3개의 요약 문장**으로 만들어 **JSON**으로 출력하게 하는 프롬프트를 작성하세요.

### 요구사항
- 기사 원문은 \`{{article}}\` 변수로 전달됩니다.
- 요약 문장 개수(3개)를 명시해야 합니다.
- 출력 형식을 JSON으로 지정하고, 키 이름(\`summary\`)을 명시해야 합니다.
- 서론/인사말 없이 JSON만 출력하도록 해야 합니다.

### 기대 출력
\`\`\`json
{ "summary": ["...", "...", "..."] }
\`\`\``,
    tests: [
      { kind: "placeholder", label: "{{article}} 변수 사용", name: "article" },
      { kind: "includes", label: "요약 개수(3) 명시", any: ["3", "세 개", "세 문장", "three"] },
      { kind: "includes", label: "JSON 형식 지정", any: ["json"] },
      { kind: "includes", label: "summary 키 명시", any: ["summary"] },
      { kind: "includes", label: "서론 없이 출력", any: ["only", "만 출력", "서론", "preamble", "다른 텍스트"] },
    ],
  },
  {
    slug: "product-photo",
    level: 2,
    title: "이미지 프롬프트: 제품 사진",
    category: "이미지 생성",
    description: `무선 이어폰 케이스를 촬영한 **광고용 제품 사진**을 생성하는 이미지 프롬프트를 작성하세요.

### 요구사항
- 피사체(무선 이어폰 케이스)를 명시합니다.
- 조명(lighting)을 구체적으로 지정합니다.
- 카메라/렌즈 정보를 포함합니다.
- 배경을 지정합니다.
- 화면 비율을 지정합니다. (예: \`--ar 4:5\`, \`16:9\`)
- 600자 이하로 작성합니다.`,
    tests: [
      { kind: "includes", label: "피사체 명시", any: ["earbud", "이어폰", "earphone"] },
      { kind: "includes", label: "조명 지정", any: ["light", "조명", "rim", "softbox"] },
      { kind: "includes", label: "카메라/렌즈 지정", any: ["mm", "lens", "렌즈", "camera", "카메라", "macro"] },
      { kind: "includes", label: "배경 지정", any: ["background", "배경", "backdrop", "surface"] },
      { kind: "regex", label: "화면 비율 지정", pattern: "(--ar\\s*\\d+:\\d+|\\b\\d+:\\d+\\b|비율)" },
      { kind: "maxLength", label: "600자 이하", value: 600 },
    ],
  },
  {
    slug: "few-shot-sentiment",
    level: 2,
    title: "Few-shot 감정 분류기",
    category: "분류",
    description: `상품 리뷰를 **긍정 / 부정** 중 하나로 분류하는 few-shot 프롬프트를 작성하세요.

### 요구사항
- 분류할 리뷰는 \`{{review}}\` 변수로 전달됩니다.
- 예시(입력 → 정답)를 **2개 이상** 포함합니다. (\`입력:\` 또는 \`Example\` 로 시작)
- 라벨은 \`긍정\`, \`부정\` 두 가지만 사용합니다.
- 라벨 외에는 아무것도 출력하지 않도록 지시합니다.`,
    tests: [
      { kind: "placeholder", label: "{{review}} 변수 사용", name: "review" },
      { kind: "regex", label: "예시 2개 이상", pattern: "(입력\\s*:|example|예시\\s*\\d)", min: 2 },
      { kind: "includes", label: "긍정 라벨", any: ["긍정"] },
      { kind: "includes", label: "부정 라벨", any: ["부정"] },
      { kind: "includes", label: "라벨만 출력", any: ["only", "만 출력", "하나만", "외에는"] },
    ],
  },
  {
    slug: "math-tutor",
    level: 3,
    title: "단계별 풀이 + 정답 태그",
    category: "추론",
    description: `초등 수학 문제를 **단계별로 풀이**한 뒤, 최종 답을 \`<answer></answer>\` 태그 안에만 넣도록 하는 프롬프트를 작성하세요.

### 요구사항
- 문제는 \`{{problem}}\` 변수로 전달됩니다.
- 단계별(step by step)로 생각하도록 지시합니다.
- 최종 답은 \`<answer>\` 태그로 감싸도록 지시합니다.
- 풀 수 없는 문제일 때의 행동을 정의합니다. (예: "모르면 ~라고 답해")
- 150자 이상, 800자 이하로 작성합니다.`,
    tests: [
      { kind: "placeholder", label: "{{problem}} 변수 사용", name: "problem" },
      { kind: "includes", label: "단계별 풀이 지시", any: ["step by step", "단계별", "단계적으로", "차근차근"] },
      { kind: "includes", label: "<answer> 태그 지정", any: ["<answer>"] },
      { kind: "includes", label: "예외 처리 정의", any: ["모르", "풀 수 없", "cannot", "unknown", "불가능"] },
      { kind: "minLength", label: "150자 이상", value: 150 },
      { kind: "maxLength", label: "800자 이하", value: 800 },
    ],
  },
  {
    slug: "brand-persona",
    level: 1,
    title: "톤 고정: 브랜드 페르소나",
    category: "기본기",
    description: `카페 브랜드 **"모닝빈"** 의 SNS 담당자 페르소나로 답하게 하는 시스템 프롬프트를 작성하세요.

### 요구사항
- 페르소나(누구로서 말하는지)를 정의합니다.
- 말투를 구체적으로 지정합니다. (예: 반말/존댓말, 이모지 사용 여부)
- 고객의 질문은 \`{{question}}\` 변수로 전달됩니다.
- 모르는 내용(메뉴·가격 등)은 지어내지 말라고 지시합니다.
- 300자 이하로 작성합니다.`,
    tests: [
      { kind: "includes", label: "페르소나 정의", any: ["you are", "너는", "당신은", "역할", "담당자"] },
      { kind: "includes", label: "말투 지정", any: ["말투", "존댓말", "반말", "tone", "어조", "이모지"] },
      { kind: "placeholder", label: "{{question}} 변수 사용", name: "question" },
      { kind: "includes", label: "지어내기 금지", any: ["지어내", "추측", "모르면", "모를 때", "확인되지", "don't make up", "do not invent"] },
      { kind: "maxLength", label: "300자 이하", value: 300 },
    ],
  },
  {
    slug: "anime-character-tags",
    level: 2,
    title: "이미지 프롬프트: 애니 캐릭터 태그",
    category: "이미지 생성",
    description: `Illustrious(SDXL 계열) 모델용 **애니 캐릭터 일러스트** 프롬프트를 태그 형식으로 작성하세요.

### 요구사항
- 품질 태그로 시작합니다. (\`masterpiece\`, \`best quality\` 등)
- 인물 수 태그를 넣습니다. (\`1girl\`, \`1boy\` 등)
- 머리·눈·의상 등 캐릭터 특징 태그를 넣습니다.
- 배경을 지정합니다.
- 마지막 줄에 \`Negative prompt:\` 로 피할 요소를 적습니다.

### 예시 형식
\`\`\`
masterpiece, best quality, 1girl, silver hair, ...
Negative prompt: lowres, bad anatomy, ...
\`\`\``,
    tests: [
      { kind: "includes", label: "품질 태그", any: ["masterpiece", "best quality", "amazing quality"] },
      { kind: "regex", label: "인물 수 태그", pattern: "\\b\\d+(girl|boy)s?\\b" },
      { kind: "includes", label: "캐릭터 특징", any: ["hair", "eyes", "uniform", "dress", "outfit"] },
      { kind: "includes", label: "배경 지정", any: ["background", "outdoors", "indoors", "street", "sky", "room", "forest"] },
      { kind: "regex", label: "Negative prompt 줄", pattern: "^Negative prompt:\\s*\\S" },
    ],
  },
  {
    slug: "meeting-minutes",
    level: 3,
    title: "회의록 정리: 결정사항과 할 일",
    category: "추출",
    description: `회의 녹취록에서 **결정사항**과 **할 일(담당자·기한)** 을 뽑아 정리하는 프롬프트를 작성하세요.

### 요구사항
- 녹취록은 \`{{transcript}}\` 변수로 전달됩니다.
- 결정사항과 할 일을 구분된 섹션으로 출력하게 합니다.
- 할 일마다 담당자와 기한을 표시하고, 없으면 "미정"으로 쓰게 합니다.
- 녹취록에 없는 내용은 추가하지 말라고 지시합니다.
- 출력 형식(마크다운 표 또는 JSON)을 지정합니다.
- 200자 이상, 900자 이하로 작성합니다.`,
    tests: [
      { kind: "placeholder", label: "{{transcript}} 변수 사용", name: "transcript" },
      { kind: "includes", label: "결정사항 섹션", any: ["결정사항", "결정 사항", "decision"] },
      { kind: "includes", label: "담당자·기한", any: ["담당자", "owner", "assignee"] },
      { kind: "includes", label: "누락 시 미정", any: ["미정", "tbd", "unknown"] },
      { kind: "includes", label: "추가 금지", any: ["없는 내용", "추가하지", "지어내", "only from", "do not add"] },
      { kind: "includes", label: "출력 형식 지정", any: ["표", "table", "json", "markdown", "마크다운"] },
      { kind: "minLength", label: "200자 이상", value: 200 },
      { kind: "maxLength", label: "900자 이하", value: 900 },
    ],
  },
];

export function getChallenge(slug: string) {
  return CHALLENGES.find((c) => c.slug === slug);
}

export function grade(prompt: string, tests: TestCase[]): TestResult[] {
  const lower = prompt.toLowerCase();
  return tests.map((t) => {
    switch (t.kind) {
      case "includes": {
        const hit = t.any.find((w) => lower.includes(w.toLowerCase()));
        return { label: t.label, passed: !!hit, detail: hit ? `"${hit}" 발견` : `다음 중 하나 필요: ${t.any.join(", ")}` };
      }
      case "regex": {
        const count = prompt.match(new RegExp(t.pattern, "gim"))?.length ?? 0;
        const min = t.min ?? 1;
        return { label: t.label, passed: count >= min, detail: `${count}회 매칭 (필요: ${min}회 이상)` };
      }
      case "placeholder": {
        const passed = prompt.includes(`{{${t.name}}}`);
        return { label: t.label, passed, detail: passed ? "변수 사용됨" : `{{${t.name}}} 가 없습니다` };
      }
      case "maxLength":
        return { label: t.label, passed: prompt.length <= t.value, detail: `${prompt.length}자` };
      case "minLength":
        return { label: t.label, passed: prompt.length >= t.value, detail: `${prompt.length}자` };
    }
  });
}

export function scoreOf(results: TestResult[]) {
  return Math.round((results.filter((r) => r.passed).length / results.length) * 100);
}

export const CATEGORIES = [...new Set(CHALLENGES.map((c) => c.category))];
