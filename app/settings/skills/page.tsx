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
import { useLocale, useTranslations } from "next-intl";

type SkillForm = {
  name: string;
  description: string;
  instructions: string;
};

const EMPTY_FORM: SkillForm = { name: "", description: "", instructions: "" };

export default function SkillSettingsPage() {
  const locale = useLocale();
  const t = useTranslations("Skills");
  const common = useTranslations("Common");
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
      toast.error(locale === "zh-CN" && error instanceof Error ? error.message : "Skill loading failed");
    } finally {
      setLoading(false);
    }
  }, [locale]);

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
      toast.error(t("validation"));
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
      toast.success(editingId ? t("updated") : t("created"));
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(locale === "zh-CN" && error instanceof Error ? error.message : "Save failed");
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
      toast.success(skill.enabled ? t("disabled") : t("enabled"));
      await load();
    } catch (error) {
      toast.error(locale === "zh-CN" && error instanceof Error ? error.message : "Status update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteSkill(skill: SkillCatalogItem) {
    if (!window.confirm(t("confirmDelete", { name: skill.name }))) {
      return;
    }
    setBusyId(skill.id);
    try {
      await readApiJson(
        await fetch(`/api/settings/skills?id=${encodeURIComponent(skill.id)}`, {
          method: "DELETE",
        }),
      );
      toast.success(t("deleted"));
      await load();
    } catch (error) {
      toast.error(locale === "zh-CN" && error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell
      title={t("title")}
      description={t("description")}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/connections">
              <Settings data-icon="inline-start" /> {t("connections")}
            </Link>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus data-icon="inline-start" /> {t("new")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        <Alert>
          <Sparkles aria-hidden="true" />
          <AlertTitle>{t("noticeTitle")}</AlertTitle>
          <AlertDescription>
            {t("noticeBody")}
          </AlertDescription>
        </Alert>

        <SkillSection
          title={t("builtin")}
          description={t("builtinDescription")}
          loading={loading}
          skills={builtinSkills}
          busyId={busyId}
          onToggle={toggleSkill}
          onEdit={openEdit}
          onDelete={deleteSkill}
        />

        <SkillSection
          title={t("custom")}
          description={t("customDescription")}
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
            <DialogTitle>{editingId ? t("edit") : t("new")}</DialogTitle>
            <DialogDescription>
              {t("formDescription")}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="skill-name">{t("name")}</FieldLabel>
              <Input
                id="skill-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={t("namePlaceholder")}
                maxLength={80}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="skill-description">{t("purpose")}</FieldLabel>
              <Input
                id="skill-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder={t("purposePlaceholder")}
                maxLength={300}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="skill-instructions">{t("instructions")}</FieldLabel>
              <Textarea
                id="skill-instructions"
                value={form.instructions}
                onChange={(event) =>
                  setForm((current) => ({ ...current, instructions: event.target.value }))
                }
                placeholder={t("instructionsPlaceholder")}
                className="min-h-44"
                maxLength={4000}
              />
              <FieldDescription>
                {t("secretWarning")}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {common("cancel")}
            </Button>
            <Button onClick={() => void saveSkill()} disabled={busyId !== null}>
              {busyId ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              {t("save")}
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
  const t = useTranslations("Skills");
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
            <CardTitle className="text-base">{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyDescription")}</CardDescription>
          </CardHeader>
          {props.emptyAction ? (
            <CardFooter>
              <Button onClick={props.emptyAction}>
                <Plus data-icon="inline-start" /> {t("first")}
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
  const locale = useLocale();
  const t = useTranslations("Skills");
  const tb = useTranslations("BuiltinSkills");
  const common = useTranslations("Common");
  const display = localizedBuiltinSkill(skill, locale, tb);
  return (
    <Card className={skill.enabled ? undefined : "opacity-70"} data-testid={`skill-card-${skill.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="shrink-0 text-primary" />
              <span className="truncate">{display.name}</span>
            </CardTitle>
            <CardDescription className="mt-1.5">{display.description}</CardDescription>
          </div>
          <Badge
            variant={skill.enabled ? "secondary" : "outline"}
            className="shrink-0 whitespace-nowrap"
          >
            {skill.enabled ? t("enabled") : t("disabled")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">
            {skill.source === "builtin" ? t("builtinBadge") : t("customBadge")}
          </Badge>
          {skill.scopes.map((scope) => (
            <Badge key={scope} variant="outline">
              {scope === "generation" ? t("generationScope") : t("patchScope")}
            </Badge>
          ))}
        </div>
        {skill.instructions ? (
          <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {locale === "en-US" && skill.source === "builtin"
              ? display.description
              : skill.instructions}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("patchOnly")}</p>
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
          {skill.enabled ? t("disable") : t("enable")}
        </Button>
        {skill.source === "custom" ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => props.onEdit(skill)}>
              <Edit3 data-icon="inline-start" /> {t("edit")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void props.onDelete(skill)}
              disabled={props.busy}
            >
              <Trash2 data-icon="inline-start" /> {common("delete")}
            </Button>
          </>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function localizedBuiltinSkill(
  skill: SkillCatalogItem,
  locale: string,
  translate: (key: never) => string,
) {
  if (locale !== "en-US" || skill.source !== "builtin") {
    return { name: skill.name, description: skill.description };
  }
  const keys: Record<string, [string, string]> = {
    "builtin.rewrite-section": ["rewriteName", "rewriteDescription"],
    "builtin.expand-hook": ["hookName", "hookDescription"],
    "builtin.compress-text": ["compressName", "compressDescription"],
    "builtin.improve-visual": ["visualName", "visualDescription"],
    "builtin.risk-check": ["riskName", "riskDescription"],
  };
  const pair = keys[skill.id];
  return pair
    ? { name: translate(pair[0] as never), description: translate(pair[1] as never) }
    : { name: skill.name, description: skill.description };
}
