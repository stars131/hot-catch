"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BookmarkIcon,
  ExternalLinkIcon,
  MapPinIcon,
  MessageSquareIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { readApiJson } from "@/lib/api-client";
import type { XDiscoveryPayload, XPost, XTrend } from "@/lib/x/discovery";
import { X_REGION_PRESETS } from "@/lib/x/discovery";

type Mode = "region" | "topic" | "accounts";
type PayloadView = XDiscoveryPayload & { cached: boolean };

export function XDiscoveryPanel() {
  const [mode, setMode] = useState<Mode>("region");
  const [woeid, setWoeid] = useState(String(X_REGION_PRESETS[0].woeid));
  const [customRegion, setCustomRegion] = useState("");
  const [topic, setTopic] = useState("AI OR 人工智能");
  const [language, setLanguage] = useState("none");
  const [accounts, setAccounts] = useState("XDevelopers\nOpenAI");
  const [payload, setPayload] = useState<PayloadView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectingId, setCollectingId] = useState<string | null>(null);

  async function search() {
    setLoading(true);
    setError(null);
    setPayload(null);
    try {
      const body = buildRequest(mode, { woeid, customRegion, topic, language, accounts });
      const result = await readApiJson<PayloadView>(
        await fetch("/api/x/discovery", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      setPayload(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "X 检索失败");
    } finally {
      setLoading(false);
    }
  }

  async function collectTrend(trend: XTrend) {
    await collect({
      id: `x-trend-${trend.rank}-${trend.name.toLowerCase().slice(0, 240)}`,
      title: trend.name,
      sourceUrl: trend.url,
      heat: trend.postCount ?? undefined,
      rank: trend.rank,
      notes: `X 地区趋势第 ${trend.rank} 名${trend.postCount == null ? "" : `，公开帖量 ${trend.postCount}`}`,
      evidence: { trend, query: payload?.query, generatedAt: payload?.generatedAt },
    });
  }

  async function collectPost(post: XPost) {
    await collect({
      id: `x-post-${post.id}`,
      title: post.text.slice(0, 200),
      sourceUrl: post.url,
      heat: post.engagementScore,
      notes: [
        post.author ? `作者：@${post.author.username}（${post.author.name}）` : "",
        post.createdAt ? `发布时间：${post.createdAt}` : "",
        `互动：赞 ${post.metrics.likes} / 转帖 ${post.metrics.reposts} / 回复 ${post.metrics.replies} / 引用 ${post.metrics.quotes}`,
      ].filter(Boolean).join("\n"),
      evidence: { post, query: payload?.query, generatedAt: payload?.generatedAt },
    });
  }

  async function collect(input: {
    id: string;
    title: string;
    sourceUrl: string;
    heat?: number;
    rank?: number;
    notes: string;
    evidence: unknown;
  }) {
    setCollectingId(input.id);
    try {
      await readApiJson(
        await fetch("/api/ideas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: "hotspot",
            platform: "x",
            title: input.title,
            notes: input.notes,
            hotspot: {
              id: input.id,
              category: "X 公开信息",
              heat: input.heat,
              rank: input.rank,
              source: payload?.source ?? "X 公开信息",
              sourceUrl: input.sourceUrl,
              evidence: input.evidence,
            },
          }),
        }),
      );
      toast.success("已收藏到选题库");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "收藏失败");
    } finally {
      setCollectingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle role="heading" aria-level={2}>X 专项检索</CardTitle>
            <CardDescription className="mt-1.5 leading-6">
              无需 X 凭证即可收集地区热点、话题公开帖和指定博主时间线；如已配置官方 API，系统会自动优先使用。
            </CardDescription>
          </div>
          <Badge variant="outline">OSINT 证据模式</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <TabsList className="grid w-full grid-cols-3 sm:w-[420px]">
            <TabsTrigger value="region">地区热点</TabsTrigger>
            <TabsTrigger value="topic">话题 / 领域</TabsTrigger>
            <TabsTrigger value="accounts">指定博主</TabsTrigger>
          </TabsList>

          <TabsContent value="region" className="pt-3">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="x-region">地区</FieldLabel>
                <Select
                  value={woeid}
                  onValueChange={(value) => {
                    setWoeid(value);
                    setCustomRegion("");
                  }}
                >
                  <SelectTrigger id="x-region">
                    <SelectValue placeholder="选择地区" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {X_REGION_PRESETS.map((region) => (
                        <SelectItem key={region.woeid} value={String(region.woeid)}>
                          {region.name} · {region.woeid}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>全球读取公开趋势；国家和城市预设读取带地区条件的热门公开帖。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="x-custom-region">自定义地区查询（可选）</FieldLabel>
                <Input
                  id="x-custom-region"
                  value={customRegion}
                  onChange={(event) => setCustomRegion(event.target.value)}
                  placeholder='例如 Perth、成都，或 place_country:AU'
                />
                <FieldDescription>填写后会覆盖上方预设；可直接使用公开 X 搜索操作符。</FieldDescription>
              </Field>
            </FieldGroup>
          </TabsContent>

          <TabsContent value="topic" className="pt-3">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="x-topic">关键词、话题或领域查询</FieldLabel>
                <Input
                  id="x-topic"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder='AI Agent OR "machine learning"'
                />
                <FieldDescription>支持 X 查询语法；系统默认排除转帖并按公开互动强度排序。</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="x-language">语言（可选）</FieldLabel>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="x-language">
                    <SelectValue placeholder="不限语言" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">不限语言</SelectItem>
                      <SelectItem value="zh">中文</SelectItem>
                      <SelectItem value="en">英文</SelectItem>
                      <SelectItem value="ja">日文</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </TabsContent>

          <TabsContent value="accounts" className="pt-3">
            <Field>
              <FieldLabel htmlFor="x-accounts">博主用户名</FieldLabel>
              <Textarea
                id="x-accounts"
                value={accounts}
                onChange={(event) => setAccounts(event.target.value)}
                className="min-h-28 font-mono"
                placeholder={"XDevelopers\nOpenAI\nusername"}
              />
              <FieldDescription>每行或逗号分隔一个用户名，最多 10 个；部分账号失败不会中断其他账号。</FieldDescription>
            </Field>
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void search()} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : <SearchIcon data-icon="inline-start" />}
            开始检索
          </Button>
          <p className="text-xs text-muted-foreground">无需凭证；公开结果缓存 5 分钟，官方结果缓存 2 分钟。</p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>X 检索不可用</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{error}</span>
              <Button asChild size="sm" variant="outline">
                <Link href="/settings/connections">可选：配置官方 X API</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {payload ? (
          <div className="flex flex-col gap-4">
            <ResultMeta payload={payload} />
            {payload.warnings.length ? (
              <Alert>
                <AlertTitle>部分结果需要留意</AlertTitle>
                <AlertDescription>{payload.warnings.join("；")}</AlertDescription>
              </Alert>
            ) : null}
            {payload.mode === "region" ? (
              payload.posts.length ? (
                <PostResults posts={payload.posts} collectingId={collectingId} onCollect={collectPost} />
              ) : (
                <TrendResults trends={payload.trends} collectingId={collectingId} onCollect={collectTrend} />
              )
            ) : payload.mode === "topic" ? (
              <PostResults posts={payload.posts} collectingId={collectingId} onCollect={collectPost} />
            ) : (
              <AccountResults accounts={payload.accounts} collectingId={collectingId} onCollect={collectPost} />
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResultMeta({ payload }: { payload: PayloadView }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{payload.source}</Badge>
        {payload.dataTier === "public-osint" ? <Badge variant="outline">无需凭证</Badge> : null}
        <span>{payload.query}</span>
        <span>·</span>
        <span>{new Date(payload.generatedAt).toLocaleString("zh-CN")}</span>
        {payload.cached ? <Badge variant="outline">缓存</Badge> : null}
        {payload.rateLimit.remaining != null ? (
          <Badge variant="outline">额度余量 {payload.rateLimit.remaining}/{payload.rateLimit.limit ?? "—"}</Badge>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">覆盖范围：{payload.coverage}</p>
    </div>
  );
}

function TrendResults({
  trends,
  collectingId,
  onCollect,
}: {
  trends: XTrend[];
  collectingId: string | null;
  onCollect: (trend: XTrend) => Promise<void>;
}) {
  if (!trends.length) return <NoResults icon={MapPinIcon} title="该地区暂时没有趋势结果" />;
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">排名</TableHead>
            <TableHead>趋势</TableHead>
            <TableHead className="w-32">公开帖量</TableHead>
            <TableHead className="w-48 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trends.map((trend) => {
            const id = `x-trend-${trend.rank}-${trend.name.toLowerCase().slice(0, 240)}`;
            return (
              <TableRow key={`${trend.rank}-${trend.name}`}>
                <TableCell className="font-mono">#{trend.rank}</TableCell>
                <TableCell className="font-medium">{trend.name}</TableCell>
                <TableCell>{trend.postCount == null ? "未提供" : formatCompact(trend.postCount)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button asChild size="sm" variant="ghost">
                      <a href={trend.url} target="_blank" rel="noreferrer">
                        <ExternalLinkIcon data-icon="inline-start" />查看
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void onCollect(trend)} disabled={collectingId === id}>
                      {collectingId === id ? <Spinner data-icon="inline-start" /> : <BookmarkIcon data-icon="inline-start" />}
                      收藏
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function PostResults({
  posts,
  collectingId,
  onCollect,
}: {
  posts: XPost[];
  collectingId: string | null;
  onCollect: (post: XPost) => Promise<void>;
}) {
  if (!posts.length) return <NoResults icon={MessageSquareIcon} title="没有找到匹配的公开帖" />;
  return (
    <div className="flex flex-col gap-3">
      {posts.map((post) => (
        <PostItem key={post.id} post={post} collecting={collectingId === `x-post-${post.id}`} onCollect={onCollect} />
      ))}
    </div>
  );
}

function AccountResults({
  accounts,
  collectingId,
  onCollect,
}: {
  accounts: XDiscoveryPayload["accounts"];
  collectingId: string | null;
  onCollect: (post: XPost) => Promise<void>;
}) {
  if (!accounts.length) return <NoResults icon={UsersIcon} title="没有读取到指定博主" />;
  return (
    <div className="flex flex-col gap-5">
      {accounts.map(({ account, posts }) => (
        <section key={account.id} className="flex flex-col gap-3 rounded-lg border p-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{account.name} <span className="font-normal text-muted-foreground">@{account.username}</span></h3>
              <p className="mt-1 text-xs text-muted-foreground">{formatCompact(account.followers)} 关注者{account.location ? ` · ${account.location}` : ""}</p>
              {account.description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{account.description}</p> : null}
            </div>
            <Button asChild size="sm" variant="outline">
              <a href={`https://x.com/${account.username}`} target="_blank" rel="noreferrer">
                <ExternalLinkIcon data-icon="inline-start" />主页
              </a>
            </Button>
          </header>
          {posts.length ? (
            <div className="flex flex-col gap-3">
              {posts.map((post) => (
                <PostItem key={post.id} post={post} collecting={collectingId === `x-post-${post.id}`} onCollect={onCollect} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">该账号没有返回可用公开帖。</p>
          )}
        </section>
      ))}
    </div>
  );
}

function PostItem({ post, collecting, onCollect }: { post: XPost; collecting: boolean; onCollect: (post: XPost) => Promise<void> }) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 [content-visibility:auto]">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{post.author ? `@${post.author.username}` : "未知作者"}{post.createdAt ? ` · ${formatDate(post.createdAt)}` : ""}</span>
        <Badge variant="outline">互动分 {formatCompact(post.engagementScore)}</Badge>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6">{post.text}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          赞 {formatCompact(post.metrics.likes)} · 转帖 {formatCompact(post.metrics.reposts)} · 回复 {formatCompact(post.metrics.replies)} · 引用 {formatCompact(post.metrics.quotes)}
        </p>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="ghost">
            <a href={post.url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon data-icon="inline-start" />证据
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={() => void onCollect(post)} disabled={collecting}>
            {collecting ? <Spinner data-icon="inline-start" /> : <BookmarkIcon data-icon="inline-start" />}
            收藏
          </Button>
        </div>
      </div>
    </article>
  );
}

function NoResults({ icon: Icon, title }: { icon: React.ComponentType; title: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>调整条件后重新检索；系统不会用模拟数据填充空结果。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function buildRequest(
  mode: Mode,
  values: { woeid: string; customRegion: string; topic: string; language: string; accounts: string },
) {
  if (mode === "region") {
    const numericWoeid = Number(values.woeid);
    const preset = X_REGION_PRESETS.find((region) => region.woeid === numericWoeid);
    const regionQuery = values.customRegion.trim();
    return {
      mode,
      woeid: regionQuery ? 1 : numericWoeid,
      regionName: regionQuery || preset?.name,
      ...(regionQuery ? { regionQuery } : {}),
      maxResults: 20,
    };
  }
  if (mode === "topic") {
    return {
      mode,
      query: values.topic,
      ...(values.language === "none" ? {} : { language: values.language }),
      maxResults: 30,
    };
  }
  return {
    mode,
    usernames: values.accounts.split(/[\s,，;；]+/).map((value) => value.trim()).filter(Boolean),
    maxResults: 10,
  };
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
