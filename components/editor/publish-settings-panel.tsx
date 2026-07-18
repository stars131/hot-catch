"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { readApiJson } from "@/lib/api-client";
import {
  defaultContentPublishSettings,
  type ContentPublishSettings,
} from "@/lib/editor/publish-settings";
import { PLATFORM_DEFINITIONS, type PlatformId } from "@/lib/platforms/registry";

type SettingsResponse = { settings: ContentPublishSettings; updatedAt: string | null };

export function PublishSettingsPanel(props: { contentId: string; platform: PlatformId }) {
  const [settings, setSettings] = useState<ContentPublishSettings>(() => defaultContentPublishSettings(props.platform));
  const [saved, setSaved] = useState<ContentPublishSettings>(() => defaultContentPublishSettings(props.platform));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(saved), [saved, settings]);
  const definition = PLATFORM_DEFINITIONS[props.platform];

  useEffect(() => {
    const controller = new AbortController();
    const fallback = defaultContentPublishSettings(props.platform);
    setSettings(fallback);
    setSaved(fallback);
    setLoading(true);
    fetch(`/api/content/${props.contentId}/publish-settings`, {
        cache: "no-store",
        signal: controller.signal,
      })
      .then((response) => readApiJson<SettingsResponse>(response))
      .then((data) => {
        setSettings(data.settings);
        setSaved(data.settings);
        setUpdatedAt(data.updatedAt);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        toast.error(error instanceof Error ? error.message : "发布设置加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [props.contentId, props.platform]);

  function patch(next: Partial<ContentPublishSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  async function save() {
    setSaving(true);
    try {
      const data = await readApiJson<SettingsResponse>(
        await fetch(`/api/content/${props.contentId}/publish-settings`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(settings),
        }),
      );
      setSettings(data.settings);
      setSaved(data.settings);
      setUpdatedAt(data.updatedAt);
      toast.success("发布设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发布设置保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载发布设置…</div>;
  }

  return (
    <div className="space-y-5" data-testid="publish-settings-panel">
      <div className="rounded-xl border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">
        {definition.publishing === "export_only"
          ? `${definition.displayName} 当前为导出后手动发布。这里保存的是发布准备清单，不会自动向平台提交。`
          : `保存后可进入发布中心继续选择账号与素材。是否可直接发布取决于已配置的服务商能力及平台最终确认。`}
      </div>

      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="publish-scheduled-at">计划发布时间</FieldLabel>
          <Input
            id="publish-scheduled-at"
            type="datetime-local"
            value={toDateTimeLocal(settings.scheduledAt)}
            onChange={(event) => patch({ scheduledAt: toIso(event.target.value) })}
          />
          <FieldDescription>留空表示不预设时间；平台时区与最终排期请在发布前复核。</FieldDescription>
        </Field>

        {(props.platform === "xiaohongshu" || props.platform === "douyin" || props.platform === "youtube" || props.platform === "tiktok") ? (
          <SelectField
            id="publish-visibility"
            label="可见范围"
            value={settings.visibility}
            options={visibilityOptions(props.platform)}
            onChange={(value) => patch({ visibility: value as ContentPublishSettings["visibility"] })}
          />
        ) : null}

        {props.platform === "xiaohongshu" ? (
          <>
            <SelectField id="publish-cover" label="封面来源" value={settings.coverMode} options={[
              ["first_image", "首图"], ["custom", "自定义封面"],
            ]} onChange={(value) => patch({ coverMode: value as ContentPublishSettings["coverMode"] })} />
            <DisclosureField value={settings.contentDisclosure} onChange={(value) => patch({ contentDisclosure: value })} />
            <CheckField id="publish-comments" label="允许评论" checked={settings.allowComments} onChange={(value) => patch({ allowComments: value })} />
          </>
        ) : null}

        {props.platform === "douyin" || props.platform === "tiktok" ? (
          <>
            <CheckField id="publish-comments" label="允许评论" checked={settings.allowComments} onChange={(value) => patch({ allowComments: value })} />
            <CheckField id="publish-duet" label="允许合拍 / Duet" checked={settings.allowDuet} onChange={(value) => patch({ allowDuet: value })} />
            <CheckField id="publish-stitch" label="允许剪辑 / Stitch" checked={settings.allowStitch} onChange={(value) => patch({ allowStitch: value })} />
            <CheckField id="publish-ai" label="标记 AI 生成内容" checked={settings.aiGenerated} onChange={(value) => patch({ aiGenerated: value })} />
            <CheckField id="publish-branded" label="标记商业合作内容" checked={settings.brandedContent} onChange={(value) => patch({ brandedContent: value })} />
          </>
        ) : null}

        {props.platform === "youtube" ? (
          <>
            <SelectField id="publish-audience" label="儿童内容声明" value={settings.audience} options={[
              ["not_made_for_kids", "不是面向儿童"], ["made_for_kids", "面向儿童"],
            ]} onChange={(value) => patch({ audience: value as ContentPublishSettings["audience"] })} />
            <Field><FieldLabel htmlFor="publish-category">分类</FieldLabel><Input id="publish-category" value={settings.category} placeholder="例如 Education" onChange={(event) => patch({ category: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor="publish-language">视频语言</FieldLabel><Input id="publish-language" value={settings.language} placeholder="例如 zh-CN" onChange={(event) => patch({ language: event.target.value })} /></Field>
            <CheckField id="publish-comments" label="允许评论" checked={settings.allowComments} onChange={(value) => patch({ allowComments: value })} />
            <CheckField id="publish-notify" label="通知订阅者" checked={settings.notifySubscribers} onChange={(value) => patch({ notifySubscribers: value })} />
          </>
        ) : null}

        {props.platform === "instagram" ? (
          <>
            <SelectField id="publish-placement" label="发布位置" value={settings.placement} options={[["feed", "Feed"], ["reels", "Reels"]]} onChange={(value) => patch({ placement: value as ContentPublishSettings["placement"] })} />
            <SelectField id="publish-ratio" label="画面比例" value={settings.aspectRatio} options={[["4:5", "4:5 竖图"], ["1:1", "1:1 方图"], ["9:16", "9:16 竖屏"]]} onChange={(value) => patch({ aspectRatio: value as ContentPublishSettings["aspectRatio"] })} />
            <CheckField id="publish-comments" label="允许评论" checked={settings.allowComments} onChange={(value) => patch({ allowComments: value })} />
            <CheckField id="publish-likes" label="隐藏点赞数" checked={settings.hideLikeCount} onChange={(value) => patch({ hideLikeCount: value })} />
            <CheckField id="publish-branded" label="标记商业合作内容" checked={settings.brandedContent} onChange={(value) => patch({ brandedContent: value })} />
            <Field><FieldLabel htmlFor="publish-alt">帖子级 Alt Text</FieldLabel><Textarea id="publish-alt" value={settings.altText} onChange={(event) => patch({ altText: event.target.value })} /><FieldDescription>逐页 Alt Text 仍在内容编辑区维护。</FieldDescription></Field>
          </>
        ) : null}

        {props.platform === "x" ? (
          <>
            <SelectField id="publish-replies" label="谁可以回复" value={settings.replyPermission} options={[
              ["everyone", "所有人"], ["following", "我关注的账号"], ["mentioned", "仅提及的账号"],
            ]} onChange={(value) => patch({ replyPermission: value as ContentPublishSettings["replyPermission"] })} />
            <CheckField id="publish-sensitive" label="包含敏感媒体" checked={settings.sensitiveMedia} onChange={(value) => patch({ sensitiveMedia: value })} />
            <CheckField id="publish-numbering" label="发布时给线程自动编号" checked={settings.numberThread} onChange={(value) => patch({ numberThread: value })} />
            <Field><FieldLabel htmlFor="publish-alt">媒体 Alt Text</FieldLabel><Textarea id="publish-alt" value={settings.altText} onChange={(event) => patch({ altText: event.target.value })} /></Field>
          </>
        ) : null}

        {props.platform === "reddit" ? (
          <>
            <Field><FieldLabel htmlFor="publish-subreddit">目标社区</FieldLabel><Input id="publish-subreddit" value={settings.subreddit} placeholder="例如 r/technology" onChange={(event) => patch({ subreddit: event.target.value.replace(/^r\//, "") })} /><FieldDescription>发布前必须打开社区规则并人工核对。</FieldDescription></Field>
            <Field><FieldLabel htmlFor="publish-flair">Flair</FieldLabel><Input id="publish-flair" value={settings.flair} onChange={(event) => patch({ flair: event.target.value })} /></Field>
            <SelectField id="publish-post-type" label="帖子类型" value={settings.postType} options={[["text", "文字"], ["link", "链接"], ["image", "图片"]]} onChange={(value) => patch({ postType: value as ContentPublishSettings["postType"] })} />
            <CheckField id="publish-nsfw" label="标记 NSFW" checked={settings.nsfw} onChange={(value) => patch({ nsfw: value })} />
            <CheckField id="publish-spoiler" label="标记 Spoiler" checked={settings.spoiler} onChange={(value) => patch({ spoiler: value })} />
            <CheckField id="publish-replies" label="接收回复通知" checked={settings.sendReplies} onChange={(value) => patch({ sendReplies: value })} />
          </>
        ) : null}

        <Field>
          <FieldLabel htmlFor="publish-note">发布备注</FieldLabel>
          <Textarea id="publish-note" value={settings.note} maxLength={500} placeholder="记录素材、审核或协作注意事项" onChange={(event) => patch({ note: event.target.value })} />
        </Field>
      </FieldGroup>

      <div className="sticky bottom-0 flex items-center gap-3 border-t bg-background/95 py-3 backdrop-blur">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {dirty ? "有未保存设置" : updatedAt ? `已保存于 ${formatTime(updatedAt)}` : "使用平台默认设置"}
        </p>
        <Button type="button" size="sm" disabled={!dirty || saving} onClick={save}>
          {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          保存设置
        </Button>
      </div>
    </div>
  );
}

function SelectField(props: { id: string; label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger id={props.id}><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{props.options.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </Field>
  );
}

function CheckField(props: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Field orientation="horizontal">
      <Checkbox id={props.id} checked={props.checked} onCheckedChange={(value) => props.onChange(value === true)} />
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
    </Field>
  );
}

function DisclosureField(props: { value: ContentPublishSettings["contentDisclosure"]; onChange: (value: ContentPublishSettings["contentDisclosure"]) => void }) {
  return <SelectField id="publish-disclosure" label="内容披露" value={props.value} options={[["none", "无"], ["ai_generated", "AI 生成"], ["commercial", "商业合作"]]} onChange={(value) => props.onChange(value as ContentPublishSettings["contentDisclosure"])} />;
}

function visibilityOptions(platform: PlatformId): Array<[string, string]> {
  if (platform === "youtube") return [["public", "公开"], ["unlisted", "不公开列出"], ["private", "私享"]];
  return [["public", "公开"], ["followers", "仅关注者/好友"], ["private", "私密"]];
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
