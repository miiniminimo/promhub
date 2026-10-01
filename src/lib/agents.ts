import type { Style } from "./types";

/** Client-safe description of each style agent (the system prompts live server-side). */
export type AgentInfo = {
  style: Style;
  name: string;
  tagline: string;
  defaultModel: string;
  examples: string[];
};

export const AGENTS: Record<Style, AgentInfo> = {
  anime: {
    style: "anime",
    name: "애니 에이전트",
    tagline: "캐릭터·의상·포즈를 태그로 정리하는 애니 전문",
    defaultModel: "Illustrious",
    examples: ["벚꽃 아래 교복 입은 소녀, 바람에 머리카락 날림", "사이버펑크 도시의 여우 귀 해커 캐릭터"],
  },
  photo: {
    style: "photo",
    name: "실사 에이전트",
    tagline: "카메라·렌즈·조명까지 잡아주는 사진 전문",
    defaultModel: "Flux.1 D",
    examples: ["비 오는 밤 네온사인 거리의 우산 쓴 사람", "젖은 콘크리트 위 무선 이어폰 제품 사진"],
  },
  illustration: {
    style: "illustration",
    name: "일러스트 에이전트",
    tagline: "재료·기법·색감을 살리는 일러스트 전문",
    defaultModel: "Flux.1 D",
    examples: ["수채화로 그린 창가의 고양이, 노을빛", "리소 인쇄 느낌의 여름 바다 포스터"],
  },
};
