"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleDot,
  Languages,
  Loader2,
  Puzzle,
  Send,
  Shapes,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CreationSetupCard } from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";

const LAST_STEP = 4;

export function CreationSetupCardView(props: {
  card: CreationSetupCard;
  state: CardInvokeState;
  processed: boolean;
  onSubmit: (optionIds: string[]) => void;
}) {
  const [platformIds, setPlatformIds] = useState<string[]>(props.card.defaultPlatformIds);
  const [localeId, setLocaleId] = useState<string>(props.card.defaultLocaleId);
  const [skillIds, setSkillIds] = useState<string[]>(props.card.defaultSkillIds);
  const [accountBindings, setAccountBindings] = useState<Record<string, string>>(
    props.card.defaultAccountBindings,
  );
  const [step, setStep] = useState(0);
  const disabled = props.processed || props.state.phase === "loading" || props.state.phase === "success";
  const zh = props.card.uiLocale === "zh-CN";

  useEffect(() => {
    setPlatformIds(props.card.defaultPlatformIds);
    setLocaleId(props.card.defaultLocaleId);
    setSkillIds(props.card.defaultSkillIds);
    setAccountBindings(props.card.defaultAccountBindings);
    setStep(0);
  }, [
    props.card.id,
    props.card.defaultAccountBindings,
    props.card.defaultLocaleId,
    props.card.defaultPlatformIds,
    props.card.defaultSkillIds,
  ]);

  const platformSummary = useMemo(
    () => props.card.platformOptions
      .filter((option) => platformIds.includes(option.id))
      .map((option) => option.label)
      .join(zh ? "、" : ", "),
    [platformIds, props.card.platformOptions, zh],
  );
  const accountSummary = useMemo(() => {
    const bound = Object.values(accountBindings)
      .map((id) => props.card.accountOptions.find((option) => option.id === id)?.label)
      .filter(Boolean);
    if (bound.length) return bound.join(zh ? "、" : ", ");
    return zh ? "使用全局人设" : "Use global persona";
  }, [accountBindings, props.card.accountOptions, zh]);
  const localeSummary = props.card.localeOptions.find((option) => option.id === localeId)?.label ?? localeId;
  const skillSummary = skillIds.length
    ? props.card.skillOptions
        .filter((option) => skillIds.includes(option.id))
        .map((option) => option.label)
        .join(zh ? "、" : ", ")
    : (zh ? "不使用额外 Skill" : "No extra skills");

  function togglePlatform(id: string) {
    if (disabled) return;
    setPlatformIds((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((value) => value !== id);
      }
      return current.length >= props.card.maxPlatforms ? current : [...current, id];
    });
  }

  function toggleSkill(id: string) {
    if (disabled) return;
    setSkillIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length >= 8
          ? current
          : [...current, id],
    );
  }

  function goToStep(next: number) {
    if (disabled) return;
    setStep(Math.max(0, Math.min(LAST_STEP, next)));
  }

  const status = props.processed || props.state.phase === "success"
    ? (zh ? "任务已创建" : "Tasks created")
    : props.state.phase === "loading"
      ? (zh ? "正在创建任务" : "Creating tasks")
      : (zh ? `设置中 · 第 ${step + 1} / ${LAST_STEP + 1} 步` : `Setting up · Step ${step + 1} of ${LAST_STEP + 1}`);

  return (
    <section
      className="mt-3 w-full max-w-2xl overflow-hidden rounded-lg border border-[#D8D1C5] bg-[#FFFDF9] shadow-[0_10px_30px_rgba(54,47,38,0.06)]"
      data-testid={`card-creation-setup-${props.card.id}`}
      data-state={props.processed ? "disabled" : props.state.phase}
    >
      <div className="border-b border-[#E6E0D7] px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#1F1D19]">
              {zh ? "确认这次创作设置" : "Confirm this creation setup"}
            </p>
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#746F67]">{props.card.brief}</p>
            {props.card.directionSummary ? (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded bg-[#EDF4EE] px-2 py-1 text-[11px] font-medium text-[#476451]">
                <Check className="h-3 w-3" />
                {zh ? "方向" : "Direction"}：{props.card.directionSummary.primaryLabel}
                {props.card.directionSummary.secondaryLabel ? ` + ${props.card.directionSummary.secondaryLabel}` : ""}
              </p>
            ) : null}
          </div>
          <span className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
            props.processed || props.state.phase === "success"
              ? "bg-[#E8F1EA] text-[#42664B]"
              : "bg-[#F1EEE8] text-[#67625A]",
          )}>
            {props.state.phase === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CircleDot className="h-3 w-3" />}
            {status}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1" aria-hidden="true">
          {Array.from({ length: LAST_STEP + 1 }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-1 rounded-full transition-colors duration-300",
                index <= step || props.processed ? "bg-[#66806D]" : "bg-[#E6E0D7]",
              )}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2 px-3 py-3 sm:px-4">
        <ProgressiveStep
          index={0}
          current={step}
          icon={<Shapes className="h-4 w-4" />}
          title={zh ? "选择目标平台" : "Choose target platforms"}
          summary={platformSummary}
          disabled={disabled}
          onEdit={goToStep}
        >
          <p className="mb-3 text-xs text-[#746F67]">
            {zh ? `可选择 1–${props.card.maxPlatforms} 个平台，每个平台会创建独立任务。` : `Choose 1–${props.card.maxPlatforms} platforms. Each gets its own task.`}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {props.card.platformOptions.map((option) => {
              const active = platformIds.includes(option.id);
              return (
                <ChoiceButton
                  key={option.id}
                  active={active}
                  disabled={disabled}
                  label={option.label}
                  description={option.description}
                  onClick={() => togglePlatform(option.id)}
                />
              );
            })}
          </div>
          <StepFooter>
            <Button size="sm" className="bg-[#355642] text-white hover:bg-[#294836]" disabled={disabled || platformIds.length === 0} onClick={() => goToStep(1)}>
              {zh ? "选择账号" : "Choose accounts"}<ChevronRight className="h-4 w-4" />
            </Button>
            <span>{zh ? `已选 ${platformIds.length} 个平台` : `${platformIds.length} selected`}</span>
          </StepFooter>
        </ProgressiveStep>

        <ProgressiveStep
          index={1}
          current={step}
          icon={<UserRound className="h-4 w-4" />}
          title={zh ? "绑定账号人设" : "Bind account personas"}
          summary={accountSummary}
          disabled={disabled}
          onEdit={goToStep}
        >
          <p className="mb-3 text-xs text-[#746F67]">
            {zh ? "每个平台可绑定一个账号；不绑定时使用全局人设。" : "Bind one account per platform, or fall back to the global persona."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {platformIds.map((platform) => {
              const platformOption = props.card.platformOptions.find((item) => item.id === platform);
              const accounts = props.card.accountOptions.filter((item) => item.platform === platform);
              return (
                <div key={platform} className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs font-medium text-[#56514A]">{platformOption?.label ?? platform}</span>
                  <Select
                    disabled={disabled}
                    value={accountBindings[platform] ?? "global"}
                    onValueChange={(value) => setAccountBindings((current) => {
                      const next = { ...current };
                      if (value === "global") delete next[platform];
                      else next[platform] = value;
                      return next;
                    })}
                  >
                    <SelectTrigger
                      aria-label={`${platformOption?.label ?? platform} target account`}
                      className="focus:ring-[#66806D] focus:ring-offset-1"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="global">{zh ? "全局人设" : "Global persona"}</SelectItem>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.label}{account.handle ? ` · @${account.handle}` : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
          <StepFooter>
            <Button size="sm" className="bg-[#355642] text-white hover:bg-[#294836]" disabled={disabled} onClick={() => goToStep(2)}>
              {zh ? "选择语言" : "Choose language"}<ChevronRight className="h-4 w-4" />
            </Button>
            <span>{zh ? "账号人设将写入生成快照" : "Account persona will be saved in the generation snapshot"}</span>
          </StepFooter>
        </ProgressiveStep>

        <ProgressiveStep
          index={2}
          current={step}
          icon={<Languages className="h-4 w-4" />}
          title={zh ? "选择内容语言" : "Choose content language"}
          summary={localeSummary}
          disabled={disabled}
          onEdit={goToStep}
        >
          <div className="flex flex-wrap gap-2">
            {props.card.localeOptions.map((option) => {
              const active = localeId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => {
                    setLocaleId(option.id);
                    window.setTimeout(() => goToStep(3), 140);
                  }}
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-200",
                    active
                      ? "-translate-y-px bg-[#E7F0E9] text-[#355840] shadow-[0_3px_9px_rgba(53,88,64,0.12)]"
                      : "bg-[#F3F0EA] text-[#56514A] hover:bg-[#EAE5DC]",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {active ? <Check className="h-3.5 w-3.5" /> : null}{option.label}
                  </span>
                </button>
              );
            })}
          </div>
          <StepFooter>
            <Button size="sm" variant="outline" disabled={disabled || !localeId} onClick={() => goToStep(3)}>
              {zh ? "继续" : "Continue"}<ChevronRight className="h-4 w-4" />
            </Button>
            <span>{zh ? "选择后自动进入下一步" : "Selecting a language advances automatically"}</span>
          </StepFooter>
        </ProgressiveStep>

        <ProgressiveStep
          index={3}
          current={step}
          icon={<Puzzle className="h-4 w-4" />}
          title={zh ? "选择本次 Skill" : "Choose skills for this run"}
          summary={skillSummary}
          disabled={disabled}
          onEdit={goToStep}
        >
          {props.card.skillOptions.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {props.card.skillOptions.map((option) => {
                const active = skillIds.includes(option.id);
                return (
                  <ChoiceButton
                    key={option.id}
                    active={active}
                    compact
                    disabled={disabled}
                    label={option.label}
                    description={option.description}
                    onClick={() => toggleSkill(option.id)}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#746F67]">
              {zh ? "当前没有启用的生成 Skill，可以直接继续。" : "No generation skills are enabled. Continue without one."}
            </p>
          )}
          <StepFooter>
            <Button size="sm" className="bg-[#355642] text-white hover:bg-[#294836]" disabled={disabled} onClick={() => goToStep(4)}>
              {zh ? "检查设置" : "Review setup"}<ChevronRight className="h-4 w-4" />
            </Button>
            <span>{zh ? `已选 ${skillIds.length} 个 Skill` : `${skillIds.length} skills selected`}</span>
          </StepFooter>
        </ProgressiveStep>

        <ProgressiveStep
          index={4}
          current={step}
          icon={<Check className="h-4 w-4" />}
          title={zh ? "确认并创建任务" : "Confirm and create tasks"}
          summary={zh ? "设置已确认" : "Setup confirmed"}
          disabled={disabled}
          onEdit={goToStep}
        >
          <dl className="grid gap-2 rounded-lg bg-[#F6F3ED] p-3 text-xs sm:grid-cols-2">
            {props.card.directionSummary ? (
              <SummaryRow
                label={zh ? "方向" : "Direction"}
                value={[props.card.directionSummary.primaryLabel, props.card.directionSummary.secondaryLabel].filter(Boolean).join(" + ")}
              />
            ) : null}
            <SummaryRow label={zh ? "平台" : "Platforms"} value={platformSummary} />
            <SummaryRow label={zh ? "账号" : "Accounts"} value={accountSummary} />
            <SummaryRow label={zh ? "语言" : "Language"} value={localeSummary} />
            <SummaryRow label="Skill" value={skillSummary} />
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {props.processed || props.state.phase === "success" ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A7C59]">
                <Check className="h-4 w-4" /> {zh ? "任务已创建" : "Tasks created"}
              </span>
            ) : (
              <Button
                size="sm"
                disabled={disabled || platformIds.length === 0 || !localeId}
                onClick={() => props.onSubmit([
                  ...platformIds,
                  localeId,
                  ...skillIds,
                  ...Object.entries(accountBindings)
                    .filter(([platform]) => platformIds.includes(platform))
                    .map(([platform, accountId]) => `account:${platform}:${accountId}`),
                ])}
                className="rounded-md bg-[#355642] text-white hover:bg-[#294836]"
              >
                {props.state.phase === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {props.card.confirmAction.label}
              </Button>
            )}
            <span className="text-[11px] text-[#746F67]">
              {zh ? `将创建 ${platformIds.length} 个独立创作任务` : `${platformIds.length} independent creation tasks will be created`}
            </span>
          </div>
          {props.state.phase === "failed" ? (
            <p className="mt-3 text-xs text-[#A3342D]">{props.state.error ?? (zh ? "执行失败，可以重试。" : "Action failed. Try again.")}</p>
          ) : null}
        </ProgressiveStep>
      </div>
    </section>
  );
}

function ProgressiveStep(props: {
  index: number;
  current: number;
  icon: React.ReactNode;
  title: string;
  summary: string;
  disabled: boolean;
  onEdit: (index: number) => void;
  children: React.ReactNode;
}) {
  const active = props.index === props.current;
  const completed = props.index < props.current;
  if (!active) {
    return (
      <button
        type="button"
        disabled={props.disabled || props.index > props.current}
        onClick={() => props.onEdit(props.index)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
          completed ? "bg-[#F4F6F2] hover:bg-[#ECF1EB]" : "bg-[#F7F5F0] text-[#9B958B]",
          props.index > props.current && "cursor-default opacity-65",
        )}
      >
        <span className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          completed ? "bg-[#DDE9DF] text-[#3F684A]" : "bg-[#ECE8E0]",
        )}>
          {completed ? <Check className="h-4 w-4" /> : props.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-[#4F4A43]">{props.title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-[#7C766D]">{completed ? props.summary : "—"}</span>
        </span>
        {completed ? <span className="text-[11px] text-[#56705D]">修改</span> : null}
      </button>
    );
  }

  return (
    <fieldset className="animate-in fade-in slide-in-from-bottom-2 rounded-lg border border-[#D8D1C5] bg-[#FFFDF9] p-3 duration-300 sm:p-4">
      <legend className="sr-only">{props.title}</legend>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#292620]">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#E9EEE8] text-[#476451]">{props.icon}</span>
        {props.title}
      </div>
      {props.children}
    </fieldset>
  );
}

function ChoiceButton(props: {
  active: boolean;
  compact?: boolean;
  disabled: boolean;
  label: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(
        "group flex items-start gap-2.5 rounded-lg border px-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-200",
        props.compact ? "min-h-12 py-2" : "min-h-16 py-2.5",
        props.active
          ? "-translate-y-px border-[#B9C9BD] bg-[#EDF4EE] shadow-[0_4px_12px_rgba(50,75,57,0.10)]"
          : "border-[#DDD7CE] hover:-translate-y-px hover:border-[#C7C0B5] hover:bg-[#FAF8F4] hover:shadow-[0_4px_12px_rgba(54,47,38,0.07)]",
        props.disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <SelectionMark active={props.active} compact={props.compact} />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-[#1F1D19] sm:text-sm">{props.label}</span>
        {props.description ? (
          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-[#746F67]">{props.description}</span>
        ) : null}
      </span>
    </button>
  );
}

function StepFooter(props: { children: React.ReactNode }) {
  return <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-[#746F67]">{props.children}</div>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[#7C766D]">{label}</dt><dd className="mt-0.5 truncate font-medium text-[#37332D]">{value}</dd></div>;
}

function SelectionMark({ active, compact = false }: { active: boolean; compact?: boolean }) {
  return (
    <span className={cn(
      "mt-0.5 flex shrink-0 items-center justify-center rounded-md border transition-colors",
      compact ? "h-4 w-4" : "h-5 w-5",
      active ? "border-[#66806D] bg-[#66806D]" : "border-[#B8B1A6] bg-[#FFFDF9]",
    )}>
      {active ? <Check className={cn("text-white", compact ? "h-3 w-3" : "h-3.5 w-3.5")} /> : null}
    </span>
  );
}
