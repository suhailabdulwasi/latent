import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Moon, Sun, Wand2, ScanSearch, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Logo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 18 18 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".35" />
      <circle cx="6" cy="18" r="2.4" fill="currentColor" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" opacity=".7" />
      <circle cx="18" cy="6" r="2.4" fill="currentColor" opacity=".45" />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "Humanizer", icon: Wand2, id: "humanizer" },
  { href: "/detector", label: "Detector", icon: ScanSearch, id: "detector" },
  { href: "/accuracy", label: "Accuracy", icon: BarChart3, id: "accuracy" },
];

function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  return (
    <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} data-testid="button-theme">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc]);
  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-primary" data-testid="link-home">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight text-foreground">Latent <span className="text-muted-foreground font-medium">Write</span></span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1" aria-label="Main">
            {NAV.map((n) => {
              const active = n.href === "/" ? loc === "/" : loc.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} data-testid={`nav-${n.id}`}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden md:inline text-xs text-muted-foreground mr-2">Runs in your browser. Nothing is uploaded.</span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 pb-20 sm:pb-0">{children}</main>
      <footer className="hidden sm:block border-t">
        <div className="mx-auto max-w-6xl px-6 py-5 text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-2">
          <span>Latent Write, part of Latent</span>
          <span>Scores are estimates. Never use a detector score as the only evidence about someone's work.</span>
        </div>
      </footer>
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur grid grid-cols-3" aria-label="Main mobile">
        {NAV.map((n) => {
          const active = n.href === "/" ? loc === "/" : loc.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} data-testid={`mnav-${n.id}`}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="h-5 w-5" />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PageHeader({ title, desc, children }: { title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{desc}</p>
      </div>
      {children}
    </div>
  );
}
