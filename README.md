# PromHub

프롬프트를 Git 처럼 버전 관리하는 서비스 (MVP).

## 실행

```bash
npm install
npm run dev
```

http://localhost:3000 — 첫 실행 시 `data/promhub.db` (SQLite) 가 자동 생성됩니다.

### AI 프롬프트 빌더 (선택)

New Prompt 의 "AI와 대화로 만들기" 는 Claude API (`claude-opus-5-5`) 를 사용합니다.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

채팅에 참고 이미지(JPG·PNG·GIF·WEBP)를 올리면 스타일을, 대화 기록(txt·md·json·csv·PDF)을 올리면 그 안의 프롬프트를 정리합니다.

키가 없으면 규칙 기반 **데모 모드**로 동작합니다. `PROMHUB_AI_DEMO=1` 로 강제할 수도 있습니다.

## 구조

| 경로 | 설명 |
|---|---|
| `/` | 둘러보기 피드 (공개 프롬프트 + Civitai 스냅샷) |
| `/p/[id]` | Civitai 게시물 상세 · 포크 |
| `/repos/[id]` | 프롬프트 저장소 (버전 히스토리, 수정/커밋, 공개 설정, 포크) |
| `/new` | 새 프롬프트 저장소 만들기 (AI 대화로 만들기 / 직접 입력, 소스 이미지 파일·링크) |
| `/me` | 마이페이지 (오픈한 프롬프트 / 포크한 프롬프트, 테스트 진행도) |
| `/tests`, `/tests/[slug]` | 프롬프트 테스트 (문제 풀이 · 자동 채점) |
| `/login`, `/signup` | 아이디/비밀번호 인증 (scrypt 해시 + 세션 쿠키) |

- DB 스키마: `src/lib/server/schema.sql`
- 테스트 문제/채점 규칙: `src/lib/challenges.ts`
- Civitai 데이터 갱신: `node scripts/fetch-civitai.mjs`
- 디자인 시스템: `DESIGN.md`

## 로컬 테스트 계정

로컬 개발 DB 에서 가입해 사용하는 테스트 계정 (실제 서비스용 아님):

- 아이디: `demo_tester`
- 비밀번호: `demo1234`
