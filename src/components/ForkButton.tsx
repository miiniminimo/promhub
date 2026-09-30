import { forkPostAction, forkRepoAction } from "@/app/actions";

type Props = { postId: string } | { repoId: number };

export function ForkButton(props: Props) {
  const action = "postId" in props ? forkPostAction.bind(null, props.postId) : forkRepoAction.bind(null, props.repoId);
  return (
    <form action={action}>
      <button type="submit" className="btn-mint w-full py-2.5 text-[13px]">
        ⑂ Fork — 내 저장소로 가져오기
      </button>
    </form>
  );
}
