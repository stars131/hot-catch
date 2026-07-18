import { Suspense } from "react";
import { CreatorAgentWorkspace } from "@/components/creator/creator-agent-workspace";

export default function CreatorPage() {
  return (
    <Suspense fallback={null}>
      <CreatorAgentWorkspace platform="xiaohongshu" global />
    </Suspense>
  );
}
