import { Suspense } from "react";
import { CreatorAgentWorkspace } from "@/components/creator/creator-agent-workspace";

export default function XiaohongshuCreatorPage() {
  return (
    <Suspense fallback={null}>
      <CreatorAgentWorkspace platform="xiaohongshu" />
    </Suspense>
  );
}
