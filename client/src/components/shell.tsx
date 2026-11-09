import { Link, useLocation } from "wouter";
import { useEffect, useState, type ReactNode } from "react";
import { GraduationCap, Briefcase, KanbanSquare, BarChart3, UserRound, Moon, Sun, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJobs, useRefresh, useTracked, useOwner } from "@/hooks/use-data";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import { OwnerLock } from "@/components/owner-lock";

const NAV = [
  { href: "/", label: "Internships", icon: GraduationCap },
  { href: "/fulltime", label: "Full-time", icon: Briefcase },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function Wordmark() {
  return (
    <div className="flex items-center gap-2" data-testid="text-brand">
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-primary" aria-label="Latent">
        <circle cx="6" cy="18" r="2.4" fill="currentColor" />
        <circle cx="12" cy="12" r="2.4" fill="currentColor" opacity=".7" />
        <circle cx="18" cy="6" r="2.4" fill="currentColor" opacity=".45" />
        <path d="M6 18 18 6" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">Latent</span>
      <span className="hidden text-xs text-muted-foreground sm:inline">ML · AI · Data internships at startups</span>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const [dark, setDark] = useState(true);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  const { data } = useJobs();
  const refresh = useRefresh();
  const { tracked } = useTracked();
  const active = tracked.filter((t) => t.status !== "hidden").length;
  const { owner } = useOwner();
  const syncing = data?.syncing || refresh.isPending;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 lg:px-6">
          <Wordmark />
          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} data-testid={`link-nav-${n.label.toLowerCase().replace(/\W/g, "")}`}
                className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  loc === n.href ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <n.icon className="h-4 w-4" />
                {n.label}
                {n.label === "Pipeline" && active > 0 && (
                  <span className="tnum rounded bg-primary/15 px-1.5 text-xs font-medium text-primary">{active}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground lg:inline" data-testid="text-synced">
              {syncing ? "Syncing job boards…" : data?.syncedAt ? `Updated ${formatDistanceToNowStrict(new Date(data.syncedAt))} ago · auto-refreshes every ${data.refreshHours}h` : "Not synced"}
            </span>
            {owner && (
              <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={syncing} data-testid="button-refresh">
                <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            )}
            <OwnerLock />
            <Button size="icon" variant="ghost" onClick={() => setDark((d) => !d)} aria-label="Toggle theme" data-testid="button-theme">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-5 md:pb-10 lg:px-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 backdrop-blur md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} data-testid={`link-mnav-${n.label.toLowerCase().replace(/\W/g, "")}`}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", loc === n.href ? "text-primary" : "text-muted-foreground")}>
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
