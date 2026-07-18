import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { EditorCenter } from "@/components/editor/editor-center";

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载编辑中心…</div>}>
      <EditorCenter />
    </Suspense>
  );
}
