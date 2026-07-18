"use client";

import { MessageCircle, MoreHorizontal, Repeat2, Send, ThumbsUp } from "lucide-react";
import type { ArtifactDraft } from "@/hooks/creator/use-artifact";
import { PLATFORM_DEFINITIONS, type PlatformId } from "@/lib/platforms/registry";
import { cn } from "@/lib/utils";

export function PlatformPreview(props: { platform: PlatformId; draft: ArtifactDraft }) {
  const structured = props.draft.structured ?? {};
  const title = props.draft.title || "未命名内容";
  const body = props.draft.body || "正文将在这里实时预览。";
  return (
    <div data-testid="platform-preview" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{PLATFORM_DEFINITIONS[props.platform].displayName} 预览</p>
          <p className="mt-1 text-xs text-muted-foreground">用于校对内容层级，不代表平台最终渲染</p>
        </div>
        <span className="rounded-full border px-2 py-1 text-[10px] font-medium text-muted-foreground">实时</span>
      </div>
      {props.platform === "xiaohongshu" ? (
        <XiaohongshuPreview title={title} body={body} structured={structured} />
      ) : props.platform === "douyin" || props.platform === "tiktok" ? (
        <ShortVideoPreview platform={props.platform} title={title} body={body} structured={structured} />
      ) : props.platform === "youtube" ? (
        <YoutubePreview title={title} body={body} structured={structured} />
      ) : props.platform === "instagram" ? (
        <InstagramPreview title={title} body={body} structured={structured} />
      ) : props.platform === "x" ? (
        <XPreview title={title} body={body} structured={structured} />
      ) : (
        <RedditPreview title={title} body={body} structured={structured} />
      )}
    </div>
  );
}

function XiaohongshuPreview(props: PreviewProps) {
  const pages = records(props.structured.pages);
  const cover = stringArray(props.structured.coverTextOptions)[0] || pages[0]?.heading || props.title;
  const tags = stringArray(props.structured.tags);
  return (
    <PreviewFrame className="bg-[#F7F1E8]">
      <div className="aspect-[3/4] rounded-xl bg-[#E7D9C8] p-5">
        <p className="editorial-label text-[#8B322B]">COVER / 01</p>
        <p className="mt-8 text-2xl font-semibold leading-tight text-[#2C2721]">{text(cover)}</p>
        <div className="mt-5 h-px w-12 bg-[#8B322B]" />
        <p className="mt-3 line-clamp-4 text-xs leading-5 text-[#5F574E]">{text(pages[0]?.body) || props.body}</p>
      </div>
      <div className="px-1 pt-4">
        <p className="font-medium leading-6">{props.title}</p>
        <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{props.body}</p>
        {tags.length ? <p className="mt-2 text-xs text-[#8B322B]">{tags.map(hash).join(" ")}</p> : null}
      </div>
    </PreviewFrame>
  );
}

function ShortVideoPreview(props: PreviewProps & { platform: "douyin" | "tiktok" }) {
  const hook = text(props.structured.hook) || props.title;
  const shots = records(props.structured.shots);
  const firstShot = shots[0];
  return (
    <div className="mx-auto w-full max-w-[250px] overflow-hidden rounded-[28px] border-[6px] border-[#24211D] bg-[#171614] text-white shadow-sm">
      <div className="relative aspect-[9/16] p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.15),transparent_38%),linear-gradient(145deg,#514A42,#171614_65%)]" />
        <p className="relative text-[10px] font-medium uppercase tracking-[.18em] text-white/60">{props.platform === "douyin" ? "DOUYIN" : "TIKTOK"} / PREVIEW</p>
        <div className="relative flex h-full flex-col justify-end pb-8">
          <p className="text-lg font-semibold leading-snug">{hook}</p>
          <p className="mt-3 line-clamp-5 text-xs leading-5 text-white/75">
            {text(firstShot?.subtitle) || text(firstShot?.onScreenText) || text(firstShot?.voiceover) || props.body}
          </p>
          <div className="mt-5 flex items-center gap-3 text-[10px] text-white/60">
            <span>9:16</span><span>·</span><span>{number(props.structured.durationSec) || "--"}s</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function YoutubePreview(props: PreviewProps) {
  return (
    <PreviewFrame>
      <div className="flex aspect-video items-end rounded-xl bg-[#272421] p-5 text-white">
        <div>
          <p className="text-[10px] uppercase tracking-[.18em] text-white/60">YouTube thumbnail</p>
          <p className="mt-2 text-xl font-semibold leading-tight">{text(props.structured.thumbnailText) || props.title}</p>
        </div>
      </div>
      <p className="mt-3 font-medium leading-6">{props.title}</p>
      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{props.body}</p>
      <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground"><span>16:9 成片</span><span>{number(props.structured.durationSec) || "--"} 秒</span></div>
    </PreviewFrame>
  );
}

function InstagramPreview(props: PreviewProps) {
  const slides = records(props.structured.slides);
  const first = slides[0];
  return (
    <PreviewFrame>
      <div className="flex items-center gap-2 pb-3 text-xs font-medium"><Avatar /><span>your_account</span></div>
      <div className="aspect-[4/5] bg-[#E7D9C8] p-6">
        <p className="text-[10px] uppercase tracking-[.18em] text-[#776B60]">Carousel / 1 of {slides.length || "?"}</p>
        <p className="mt-10 text-2xl font-semibold leading-tight">{text(first?.heading) || text(props.structured.coverText) || props.title}</p>
        <p className="mt-4 line-clamp-6 text-sm leading-6 text-[#5F574E]">{text(first?.body) || props.body}</p>
      </div>
      <div className="flex gap-4 py-3"><ThumbsUp /><MessageCircle /><Send /></div>
      <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-6"><span className="mr-1 font-medium">your_account</span>{props.body}</p>
    </PreviewFrame>
  );
}

function XPreview(props: PreviewProps) {
  const posts = records(props.structured.posts);
  const visible = posts.length ? posts.slice(0, 3) : [{ text: props.body }];
  return (
    <PreviewFrame className="divide-y p-0">
      {visible.map((post, index) => (
        <article key={index} className="flex gap-3 p-4">
          <Avatar />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-xs"><span className="font-semibold">Your account</span><span className="text-muted-foreground">@account · now</span><MoreHorizontal className="ml-auto h-4 w-4" /></div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{text(post.text)}</p>
            <div className="mt-3 flex justify-between text-muted-foreground"><MessageCircle className="h-4 w-4" /><Repeat2 className="h-4 w-4" /><ThumbsUp className="h-4 w-4" /><Send className="h-4 w-4" /></div>
          </div>
        </article>
      ))}
    </PreviewFrame>
  );
}

function RedditPreview(props: PreviewProps) {
  const communities = stringArray(props.structured.subredditSuggestions);
  return (
    <PreviewFrame>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-5 w-5 rounded-full bg-[#E6DDD2]" /><span>r/{communities[0] || "community"}</span><span>· just now</span></div>
      <h3 className="mt-3 text-lg font-semibold leading-7">{props.title}</h3>
      {text(props.structured.flairSuggestion) ? <span className="mt-2 inline-flex rounded-full bg-[#ECE7DE] px-2 py-1 text-[10px]">{text(props.structured.flairSuggestion)}</span> : null}
      <p className="mt-3 line-clamp-[10] whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{props.body}</p>
      <div className="mt-4 flex gap-4 text-xs text-muted-foreground"><span>△ Vote ▽</span><span>评论</span><span>分享</span></div>
    </PreviewFrame>
  );
}

type PreviewProps = { title: string; body: string; structured: Record<string, unknown> };

function PreviewFrame(props: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-2xl border bg-card p-4 shadow-sm", props.className)}>{props.children}</div>;
}

function Avatar() { return <span className="h-8 w-8 shrink-0 rounded-full bg-[#D9CFC2]" />; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function number(value: unknown) { return typeof value === "number" ? value : null; }
function records(value: unknown): Array<Record<string, unknown>> { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function hash(value: string) { return value.startsWith("#") ? value : `#${value}`; }
