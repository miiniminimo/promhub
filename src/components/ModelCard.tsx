import type { ReactNode } from "react";

/** "사용 모델" card shared by community posts and repos. */
export function ModelCard({ model, children }: { model: string; children?: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-tile border border-frame bg-frame">
      <div className="col-span-2 bg-canvas px-4 py-3">
        <dt className="label-mono text-secondary">사용 모델</dt>
        <dd className="mt-1 text-lg font-bold">{model}</dd>
      </div>
      {children}
    </dl>
  );
}
