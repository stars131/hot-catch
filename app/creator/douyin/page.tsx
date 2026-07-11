import { Suspense } from "react";
import { CreatorAgentWorkspace } from "@/components/creator/creator-agent-workspace";

export default function DouyinCreatorPage() {
  return (
    <Suspense fallback={null}>
      <CreatorAgentWorkspace platform="douyin" />
    </Suspense>
  );
}
