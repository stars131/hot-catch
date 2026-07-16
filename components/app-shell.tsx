import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/language-switcher";

type AppShellProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
};

export function AppShell({
  title,
  description,
  eyebrow = "STARTRACE / CREATOR OS",
  actions,
  children,
  contentClassName,
}: AppShellProps) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="flex min-h-[72px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <p className="editorial-label truncate">{eyebrow}</p>
            <div className="mt-1 flex min-w-0 items-baseline gap-3">
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
              {description ? (
                <p className="hidden truncate text-sm text-muted-foreground md:block">{description}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            {actions}
          </div>
        </div>
      </header>

      <main className={cn("min-w-0 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8", contentClassName)}>
        {children}
      </main>
    </div>
  );
}
