# PromHub

프롬프트를 Git 처럼 버전 관리하는 서비스 (MVP).

## 실행

```bash
npm install
npm run dev
```

http://localhost:3000 — 첫 실행 시 `data/promhub.db` (SQLite) 가 자동 생성됩니다.

### AI 스타일 에이전트 (선택)

New Prompt 의 프롬프트는 선택한 스타일의 **AI 에이전트**와 대화로 만들며, OpenAI Responses API (기본 `gpt-5.4-mini`) 를 사용합니다.

| 에이전트 | 전문 | 기본 모델 |
|---|---|---|
| 애니 | 캐릭터·의상·포즈를 booru 태그로 정리 | Illustrious |
| 실사 | 카메라·렌즈·조명·필름 질감 | Flux.1 D |
| 일러스트 | 재료·기법·색감·선 | Flux.1 D |

에이전트는 `search_promhub` 도구로 PromHub 의 비슷한 공개 프롬프트를 찾아 참고하고, 제목·사용 모델이 비어 있으면 채워 줍니다.
프롬프트는 한 덩어리로 저장하며, Stable Diffusion 계열 모델이면 마지막 줄에 `Negative prompt: …` 를 붙입니다 (A1111 / Civitai 형식).

`.env.local` (git 에 올라가지 않음):

```
OPENAI_API_KEY=sk-proj-...
# 선택: 다른 모델을 쓰려면
# OPENAI_MODEL=gpt-5.5
```

채팅에 참고 이미지(JPG·PNG·GIF·WEBP)를 올리면 스타일을, 대화 기록(txt·md·json·csv·PDF)을 올리면 그 안의 프롬프트를 정리합니다.

키가 없으면 규칙 기반 **오프라인 모드**로 동작합니다. 채팅 예시 문장은 미리 작성한 초안으로, 그 외 입력은 키워드를 영어로 바꿔 초안을 만들며 화면에는 데모 표시가 나타나지 않습니다. `PROMHUB_AI_DEMO=1` 로 강제할 수도 있습니다.

AI 요청은 사용자마다 **1분 10회, 하루 100회**로 제한됩니다(채팅 파일 첨부는 1분 20회, 하루 200회). AI 한도는 `.env.local` 의 `PROMHUB_AI_PER_MINUTE`, `PROMHUB_AI_PER_DAY` 로 바꿀 수 있습니다.

### 시연용 데모 경로

`/demo` 에 접속하면 시연용 데이터를 만들고 `haru_prompt` 계정으로 바로 로그인합니다 (시연 영상 촬영용).

- 개발 서버(`npm run dev`)에서만 동작합니다. `npm start` 에서는 `.env.local` 에 `PROMHUB_DEMO_ROUTE=1` 이 있어야 열립니다.
- 시연 계정: `haru_prompt`(로그인되는 계정), `mina_draws`, `jun_photo` (비밀번호 모두 `demo1234`)
- 담긴 데이터: 버전 4개짜리 애니 저장소(소스 이미지 포함), 비공개 저장소, 다른 사람 저장소 포크, 팔로우·좋아요, 프롬프트 테스트 2문제 해결 + 1문제 진행 중
- `/demo?reset=1` 은 데모 데이터를 처음 상태로 다시 만들고, `/demo?next=/new` 처럼 로그인 후 이동할 페이지를 정할 수 있습니다.

## 구조

| 경로 | 설명 |
|---|---|
| `/` | 둘러보기 피드 (공개 프롬프트 + Civitai 스냅샷) |
| `/p/[id]` | Civitai 게시물 상세 · 포크 |
| `/repos/[id]` | 프롬프트 저장소 (버전 히스토리, 수정/커밋, 공개 설정, 포크) |
| `/new` | 새 프롬프트 저장소 만들기 (AI 와 대화로 프롬프트 만들기, 소스 이미지 파일·링크) |
| `/me` | 마이페이지 (오픈한 프롬프트 / 포크한 프롬프트 / 좋아요 / 팔로워 / 팔로잉, 테스트 진행도) |
| `/u/[username]` | 사용자 프로필 (공개 프롬프트, 팔로우) |
| `/tests`, `/tests/[slug]` | 프롬프트 테스트 (문제 풀이 · 자동 채점) |
| `/login`, `/signup` | 아이디/비밀번호 인증 (scrypt 해시 + 세션 쿠키) |
| `/demo` | 시연용: 데이터 생성 + haru_prompt 계정 로그인 (개발 서버 전용) |

- DB 스키마: `src/lib/server/schema.sql`
- 테스트 문제/채점 규칙: `src/lib/challenges.ts`
- Civitai 데이터 갱신: `node scripts/fetch-civitai.mjs`
- 디자인 시스템: `DESIGN.md`

## 로컬 테스트 계정

로컬 개발 DB 에서 가입해 사용하는 테스트 계정 (실제 서비스용 아님):

- 아이디: `demo_tester`
- 비밀번호: `demo1234`
