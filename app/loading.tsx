import { Loader2 } from "lucide-react";

export default function WorkspaceLoading() {
  return (
    <main className="min-h-dvh px-4 py-5 sm:px-6 lg:px-8" aria-busy="true" aria-label="页面加载中">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-center justify-between gap-4 border-b pb-5">
          <div className="space-y-2">
            <div className="h-6 w-36 animate-pulse rounded bg-muted" />
            <div className="h-4 w-64 max-w-[70vw] animate-pulse rounded bg-muted/70" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-44 animate-pulse rounded-lg border bg-muted/35" />
          ))}
        </div>
      </div>
    </main>
  );
}
