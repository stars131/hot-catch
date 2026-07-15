"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Edit3,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { readApiJson } from "@/lib/api-client";
import type { SkillCatalogItem } from "@/lib/skills/catalog";

type SkillForm = {
  name: string;
  description: string;
  instructions: string;
};

const EMPTY_FORM: SkillForm = { name: "", description: "", instructions: "" };

export default function SkillSettingsPage() {
  const [skills, setSkills] = useState<SkillCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SkillForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      const data = await readApiJson<{ skills: SkillCatalogItem[] }>(
        await fetch("/api/settings/skills", { cache: "no-store" }),
      );
      setSkills(data.skills);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Skill 加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const builtinSkills = useMemo(
    () => skills.filter((skill) => skill.source === "builtin"),
    [skills],
  );
  const customSkills = useMemo(
    () => skills.filter((skill) => skill.source === "custom"),
    [skills],
  );

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(skill: SkillCatalogItem) {
    setEditingId(skill.id);
    setForm({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions ?? "",
    });
    setDialogOpen(true);
  }

  async function saveSkill() {
    if (!form.name.trim() || !form.description.trim() || !form.instructions.trim()) {
      toast.error("请完整填写名称、用途和执行说明");
      return;
    }
    setBusyId(editingId ?? "create");
    try {
      await readApiJson(
        await fetch("/api/settings/skills", {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
        }),
      );
      toast.success(editingId ? "Skill 已更新" : "Skill 已创建");
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSkill(skill: SkillCatalogItem) {
    setBusyId(skill.id);
    try {
      await readApiJson(
        await fetch("/api/settings/skills", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: skill.id, enabled: !skill.enabled }),
        }),
      );
      toast.success(skill.enabled ? "Skill 已停用" : "Skill 已启用");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状态更新失败");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteSkill(skill: SkillCatalogItem) {
    if (!window.confirm(`确定删除“${skill.name}”吗？已经保存的任务快照不会被删除。`)) {
      return;
    }
    setBusyId(skill.id);
    try {
      await readApiJson(
        await fetch(`/api/settings/skills?id=${encodeURIComponent(skill.id)}`, {
          method: "DELETE",
        }),
      );
      toast.success("Skill 已删除");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell
      title="Skill 设置"
      description="管理可复用的创作方法，并在每次创作时显式选择。"
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/connections">
              <Settings data-icon="inline-start" /> 连接设置
            </Link>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus data-icon="inline-start" /> 新建 Skill
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        <Alert>
          <Sparkles aria-hidden="true" />
          <AlertTitle>Skill 会在生成前组合成补充创作要求</AlertTitle>
          <AlertDescription>
            当前只支持说明型 Skill，不执行上传代码或任意远程地址。一次创作最多选择 8 个；任务会保存当时的 Skill 快照，后续修改不会改变历史记录。
          </AlertDescription>
        </Alert>

        <SkillSection
          title="内置 Skill"
          description="由系统维护，可启用或停用；支持整篇创作的 Skill 会出现在创作输入框的多选列表中。"
          loading={loading}
          skills={builtinSkills}
          busyId={busyId}
          onToggle={toggleSkill}
          onEdit={openEdit}
          onDelete={deleteSkill}
        />

        <SkillSection
          title="我的 Skill"
          description="把你的写作方法、固定结构、品牌语气或审核清单保存下来。"
          loading={loading}
          skills={customSkills}
          busyId={busyId}
          onToggle={toggleSkill}
          onEdit={openEdit}
          onDelete={deleteSkill}
          emptyAction={openCreate}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑 Skill" : "新建 Skill"}</DialogTitle>
            <DialogDescription>
              写清楚适用场景和执行要求。创作时可以同时选择多个 Skill。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="skill-name">名称</FieldLabel>
              <Input
                id="skill-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="例如：第一人称经验分享"
                maxLength={80}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="skill-description">用途说明</FieldLabel>
              <Input
                id="skill-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="什么时候应该选择它"
                maxLength={300}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="skill-instructions">执行说明</FieldLabel>
              <Textarea
                id="skill-instructions"
                value={form.instructions}
                onChange={(event) =>
                  setForm((current) => ({ ...current, instructions: event.target.value }))
                }
                placeholder="用第一人称写作；先给具体场景，再总结方法；不要使用说教口吻……"
                className="min-h-44"
                maxLength={4000}
              />
              <FieldDescription>
                只写创作规则，不要填写 API Key、密码或其他敏感信息。
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void saveSkill()} disabled={busyId !== null}>
              {busyId ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              保存 Skill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SkillSection(props: {
  title: string;
  description: string;
  loading: boolean;
  skills: SkillCatalogItem[];
  busyId: string | null;
  onToggle: (skill: SkillCatalogItem) => Promise<void>;
  onEdit: (skill: SkillCatalogItem) => void;
  onDelete: (skill: SkillCatalogItem) => Promise<void>;
  emptyAction?: () => void;
}) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${props.title}-heading`}>
      <div>
        <h2 id={`${props.title}-heading`} className="text-lg font-semibold tracking-tight">
          {props.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
      </div>
      {props.loading ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Card key={item}>
              <CardHeader className="flex flex-col gap-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent><Skeleton className="h-16 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      ) : props.skills.length ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {props.skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              busy={props.busyId === skill.id}
              onToggle={props.onToggle}
              onEdit={props.onEdit}
              onDelete={props.onDelete}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">还没有自定义 Skill</CardTitle>
            <CardDescription>先把一种你经常重复说明的创作方法保存下来。</CardDescription>
          </CardHeader>
          {props.emptyAction ? (
            <CardFooter>
              <Button onClick={props.emptyAction}>
                <Plus data-icon="inline-start" /> 新建第一个 Skill
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      )}
    </section>
  );
}

function SkillCard(props: {
  skill: SkillCatalogItem;
  busy: boolean;
  onToggle: (skill: SkillCatalogItem) => Promise<void>;
  onEdit: (skill: SkillCatalogItem) => void;
  onDelete: (skill: SkillCatalogItem) => Promise<void>;
}) {
  const { skill } = props;
  return (
    <Card className={skill.enabled ? undefined : "opacity-70"} data-testid={`skill-card-${skill.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="shrink-0 text-primary" />
              <span className="truncate">{skill.name}</span>
            </CardTitle>
            <CardDescription className="mt-1.5">{skill.description}</CardDescription>
          </div>
          <Badge
            variant={skill.enabled ? "secondary" : "outline"}
            className="shrink-0 whitespace-nowrap"
          >
            {skill.enabled ? "已启用" : "已停用"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{skill.source === "builtin" ? "内置" : "自定义"}</Badge>
          {skill.scopes.map((scope) => (
            <Badge key={scope} variant="outline">
              {scope === "generation" ? "整篇创作" : "局部修改"}
            </Badge>
          ))}
        </div>
        {skill.instructions ? (
          <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {skill.instructions}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">此 Skill 只用于修改已选中的内容区块。</p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          variant={skill.enabled ? "outline" : "default"}
          size="sm"
          onClick={() => void props.onToggle(skill)}
          disabled={props.busy}
        >
          {props.busy ? <Spinner data-icon="inline-start" /> : null}
          {skill.enabled ? "停用" : "启用"}
        </Button>
        {skill.source === "custom" ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => props.onEdit(skill)}>
              <Edit3 data-icon="inline-start" /> 编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void props.onDelete(skill)}
              disabled={props.busy}
            >
              <Trash2 data-icon="inline-start" /> 删除
            </Button>
          </>
        ) : null}
      </CardFooter>
    </Card>
  );
}
