"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArrowRight, Lightbulb, MessageSquarePlus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { readApiJson } from "@/lib/api-client";

type Idea = {
  id: string;
  title: string;
  angle: string | null;
  audience: string | null;
  notes: string | null;
  source: "hotspot" | "manual" | "reference";
  platform: string | null;
  updatedAt: string;
  trendTopic: { currentScore: number | null } | null;
  _count: { contents: number };
};

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readApiJson<{ ideas: Idea[] }>(
        await fetch("/api/ideas", { cache: "no-store" }),
      );
      setIdeas(data.ideas);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "选题加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword
      ? ideas.filter((idea) =>
          `${idea.title} ${idea.angle ?? ""} ${idea.audience ?? ""} ${idea.notes ?? ""}`
            .toLowerCase()
            .includes(keyword),
        )
      : ideas;
  }, [ideas, query]);

  async function archive(ideaId: string) {
    try {
      await readApiJson(
        await fetch(`/api/ideas/${ideaId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        }),
      );
      setIdeas((current) => current.filter((idea) => idea.id !== ideaId));
      toast.success("选题已归档");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "归档失败");
    }
  }

  return (
    <AppShell
      title="选题库"
      description="对话里确认的选题会保存到这里；继续创作时仍回到同一条消息流。"
      actions={
        <Button size="sm" asChild>
          <Link href="/creator?prefill=我想规划一个新选题，请先帮我梳理受众、价值和不同切入角度。">
            <MessageSquarePlus className="h-4 w-4" /> 开启选题对话
          </Link>
        </Button>
      }
    >
      <div className="space-y-5">
        <Card className="border-0 bg-[#EFEAE1] shadow-none">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(280px,.65fr)] md:items-end">
            <div>
              <p className="editorial-label">CONVERSATION-FIRST IDEAS</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">用对话形成选题，不再填写孤立表单</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                描述一个模糊主题即可。系统会先给方向卡，再使用你自己的默认模型生成候选选题；只有你确认的候选会进入这个私人选题库。
              </p>
            </div>
            <label className="relative block">
              <span className="sr-only">搜索选题</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、受众或角度"
                className="bg-[#FFFDF9] pl-9"
              />
            </label>
          </CardContent>
        </Card>

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-56 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !visible.length ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Lightbulb className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-4 font-medium">{query ? "没有匹配的选题" : "选题库还是空的"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {query ? "换一个关键词试试。" : "开启一次选题对话，或先在热点研究里选择一个话题。"}
              </p>
              {!query ? (
                <Button className="mt-5" asChild>
                  <Link href="/creator?prefill=帮我从一个模糊想法开始规划选题。">
                    开启对话 <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visible.map((idea) => (
              <Card key={idea.id} className="flex flex-col shadow-none">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {idea.source === "hotspot"
                            ? "热点研究"
                            : idea.source === "reference"
                              ? "参考资料"
                              : "对话选题"}
                        </Badge>
                        {idea.trendTopic?.currentScore != null ? (
                          <span className="font-mono text-xs text-brand">
                            热度 {idea.trendTopic.currentScore.toFixed(1)}
                          </span>
                        ) : null}
                      </div>
                      <CardTitle className="text-lg leading-6">{idea.title}</CardTitle>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="归档"
                      onClick={() => void archive(idea.id)}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                  <CardDescription>
                    更新于 {new Date(idea.updatedAt).toLocaleString("zh-CN")} · 已创建 {idea._count.contents} 个作品
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <div className="space-y-3 text-sm leading-6">
                    <p><span className="text-muted-foreground">角度：</span>{idea.angle || "待在对话中补充"}</p>
                    <p><span className="text-muted-foreground">受众：</span>{idea.audience || "待在对话中补充"}</p>
                    {idea.notes ? <p className="line-clamp-2 text-xs text-muted-foreground">{idea.notes}</p> : null}
                  </div>
                  <Button className="mt-5 w-full" variant="outline" asChild>
                    <Link href={`/creator?prefill=${encodeURIComponent(buildIdeaPrompt(idea))}`}>
                      在对话中继续 <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function buildIdeaPrompt(idea: Idea) {
  return [
    `继续完善这个选题：${idea.title}`,
    idea.angle ? `当前角度：${idea.angle}` : null,
    idea.audience ? `目标受众：${idea.audience}` : null,
    idea.notes ? `备注：${idea.notes}` : null,
    "请先判断还缺什么信息，再用卡片让我确认创作方向。",
  ]
    .filter(Boolean)
    .join("\n");
}
