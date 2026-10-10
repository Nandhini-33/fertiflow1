import { format, formatDistanceToNowStrict } from "date-fns";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Priority, Task, WorkflowState } from "@/lib/workflow/types";
import { isOverdue } from "@/lib/workflow/engine";

export const fmtTime = (t: number) => format(t, "d MMM, HH:mm");
export const fmtAgo = (t: number) => formatDistanceToNowStrict(t, { addSuffix: true });
export function fmtDur(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden>
        {[0, 72, 144, 216, 288].map((r) => (
          <circle key={r} cx="20" cy="11" r="7" transform={`rotate(${r} 20 20)`} className="fill-primary/25 stroke-primary" strokeWidth="1.5" />
        ))}
        <circle cx="20" cy="20" r="4" className="fill-primary" />
      </svg>
      {!compact && <span className="font-display text-xl font-semibold text-foreground">FertiFlow</span>}
    </div>
  );
}

type Tone = "green" | "amber" | "red" | "pink" | "muted";
const tones: Record<Tone, string> = {
  green: "bg-success-soft text-success border-success/20",
  amber: "bg-warning-soft text-warning border-warning/25",
  red: "bg-danger-soft text-destructive border-destructive/20",
  pink: "bg-accent text-primary border-primary/20",
  muted: "bg-muted text-muted-foreground border-border",
};
export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function StatusBadge({ task, state, now }: { task: Task; state: Pick<WorkflowState, "departments">; now: number }) {
  if (task.status === "completed") return <Pill tone="green">Completed</Pill>;
  if (isOverdue(state, task, now)) return <Pill tone="red">Overdue</Pill>;
  if (task.status === "in_progress") return <Pill tone="pink">In progress</Pill>;
  return <Pill tone="amber">Incoming</Pill>;
}

const pTone: Record<Priority, Tone> = { low: "muted", normal: "muted", high: "amber", urgent: "red" };
export function PriorityBadge({ p }: { p: Priority }) {
  return <Pill tone={pTone[p]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Pill>;
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({ label, value, icon, tone = "pink", hint }: { label: string; value: ReactNode; icon: ReactNode; tone?: Tone; hint?: string }) {
  return (
    <div className="card-surface card-hover p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg border", tones[tone])}>{icon}</span>
      </div>
      <div className="mt-2 font-display text-3xl font-semibold text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

export function Section({ title, children, action, className }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn("card-surface p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
