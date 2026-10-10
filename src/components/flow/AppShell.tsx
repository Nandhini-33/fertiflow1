import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  KanbanSquare,
  LayoutDashboard,
  Menu,
  RotateCcw,
  Search,
  Settings,
  Users,
  ArrowLeftRight,
  Waves,
  Sparkles,
  Mic,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { deptName } from "@/lib/workflow/engine";
import { DEMO_USERS } from "@/lib/workflow/seed";
import { useFlow, useHydrateFlow } from "@/lib/workflow/store";
import { fmtAgo, Logo, Pill } from "./ui";
import { VoiceAssistantModal } from "./VoiceAssistantModal";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/board", label: "Workflow Board", icon: KanbanSquare },
  { to: "/patients", label: "Patients", icon: Users },
  { to: "/departments", label: "Departments", icon: Building2 },
  { to: "/tasks", label: "Tasks", icon: ClipboardList },
  { to: "/handovers", label: "Handover History", icon: ArrowLeftRight },
  { to: "/simulator", label: "Ripple Simulator", icon: Waves },
  { to: "/assistant", label: "AI Voice Assistant", icon: Sparkles },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Workflow Settings", icon: Settings },
] as const;

function Nav({ onNav }: { onNav?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const unread = useFlow((s) => s.notifications.filter((n) => !n.read).length);
  return (
    <div className="flex h-full flex-col gap-6 p-5">
      <div>
        <Logo />
        <div className="mt-2 text-[11px] font-medium text-muted-foreground">Bloom Fertility Centre · Clinic Workflow</div>
      </div>
      <nav className="flex flex-col gap-1 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? path === "/" : path.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              onClick={onNav}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground shadow-soft" : "text-sidebar-foreground hover:bg-sidebar-accent",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
              {to === "/notifications" && unread > 0 && (
                <span
                  className={cn(
                    "ml-auto rounded-full px-1.5 text-[10px] font-bold",
                    active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
                  )}
                >
                  {unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-xl border border-sidebar-border bg-card/70 p-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1 font-semibold text-foreground">
          <Activity className="h-3.5 w-3.5 text-primary" />
          Demo Mode
        </div>
        Fictional patient IDs only. Data stays after refresh in browser storage.
      </div>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const { patients, tasks, departments } = useFlow();
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return patients
      .filter((p) => p.id.toLowerCase().includes(t) || (p.label && p.label.toLowerCase().includes(t)) || tasks.some((k) => k.patientId === p.id && k.title.toLowerCase().includes(t)))
      .slice(0, 6);
  }, [q, patients, tasks]);

  return (
    <div className="relative w-full max-w-xs">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search patient ID or task…"
        className="bg-card pl-9"
        aria-label="Global search"
      />
      {results.length > 0 && (
        <div className="card-surface absolute z-50 mt-1 w-full p-1 shadow-lg">
          {results.map((p) => (
            <Link
              key={p.id}
              to="/patients/$patientId"
              params={{ patientId: p.id }}
              onClick={() => setQ("")}
              className="flex justify-between rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <div>
                <span className="font-mono font-semibold">{p.id}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{p.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {p.status === "completed" ? "Completed" : deptName({ departments }, p.currentDept)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Bellmenu() {
  const { notifications, markRead, markAllRead, departments } = useFlow();
  const unread = notifications.filter((n) => !n.read);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          <button className="text-xs text-primary hover:underline" onClick={markAllRead}>
            Mark all read
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.slice(0, 8).map((n) => (
            <Link
              key={n.id}
              to="/patients/$patientId"
              params={{ patientId: n.patientId }}
              onClick={() => markRead(n.id)}
              className={cn("block border-b px-4 py-2.5 text-sm hover:bg-muted", !n.read && "bg-accent/50")}
            >
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">
                  {n.patientId} · {deptName({ departments }, n.deptId)}
                </span>
                {fmtAgo(n.at)}
              </div>
              <div className="mt-0.5">{n.message}</div>
            </Link>
          ))}
        </div>
        <Link to="/notifications" className="block px-4 py-2.5 text-center text-xs font-semibold text-primary hover:bg-muted">
          View all
        </Link>
      </PopoverContent>
    </Popover>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const ready = useHydrateFlow();
  const [open, setOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const { user, setUser, resetDemo, tickDelays } = useFlow();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const current = NAV.find((n) => (n.to === "/" ? path === "/" : path.startsWith(n.to)))?.label ?? "FertiFlow";

  useEffect(() => {
    if (!ready) return;
    tickDelays();
    const t = setInterval(tickDelays, 15_000);
    return () => clearInterval(t);
  }, [ready, tickDelays]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <Nav />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Nav onNav={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur md:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>

          <div className="mr-auto">
            <div className="text-[11px] text-muted-foreground">FertiFlow / {current}</div>
            <div className="font-display text-lg font-semibold leading-tight">{current}</div>
          </div>

          <Pill tone="pink" className="hidden sm:inline-flex">
            Demo mode: Fictional data only
          </Pill>

          {/* Quick Voice Assistant Mic Button in Header */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVoiceOpen(true)}
            className="flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            title="Open Voice Assistant"
          >
            <Mic className="h-4 w-4" />
            <span className="hidden md:inline text-xs font-semibold">Voice AI</span>
          </Button>

          <GlobalSearch />
          <Bellmenu />

          {/* 5-Role Demo User Switcher */}
          <Select
            value={user.name}
            onValueChange={(v) => {
              const selected = DEMO_USERS.find((u) => u.name === v);
              if (selected) setUser(selected);
            }}
          >
            <SelectTrigger className="w-auto min-w-48 bg-card text-xs font-medium" aria-label="Demo user">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEMO_USERS.map((u) => (
                <SelectItem key={u.name} value={u.name} className="text-xs">
                  <span className="font-semibold">{u.name}</span>{" "}
                  <span className="text-muted-foreground text-[11px]">({u.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            title="Reset demo data"
            aria-label="Reset demo data"
            onClick={() => {
              if (confirm("Reset all demo data back to clean initial state?")) resetDemo();
            }}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">
          {ready ? children : <div className="grid h-64 place-items-center text-sm text-muted-foreground">Loading clinic workflows…</div>}
        </main>
      </div>

      <VoiceAssistantModal open={voiceOpen} onOpenChange={setVoiceOpen} />
    </div>
  );
}
