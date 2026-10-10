import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Clock, Hourglass, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, fmtDur, fmtTime, PageHeader, Pill } from "@/components/flow/ui";
import { cn } from "@/lib/utils";
import { deptName, getDept, isNearTarget, isOverdue, waitingMs } from "@/lib/workflow/engine";
import { useFlow, useNow } from "@/lib/workflow/store";
import type { NotificationType } from "@/lib/workflow/types";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/notifications")({
  head: () => meta("Notifications", "In-app alerts for assignments, handovers, overdue tasks and escalations."),
  component: Notifications,
});

const LABEL: Record<NotificationType, [string, "green" | "amber" | "red" | "pink" | "muted"]> = {
  assignment: ["New assignment", "pink"],
  handover: ["Handover", "green"],
  overdue: ["Overdue", "red"],
  reassignment: ["Reassignment", "muted"],
  handover_failed: ["Handover failed", "red"],
  workflow_complete: ["Workflow complete", "green"],
  escalation: ["Escalation", "red"],
};

function Notifications() {
  const s = useFlow();
  const now = useNow();
  const [type, setType] = useState("all");

  const openTasks = s.tasks.filter((t) => t.status !== "completed");
  const delayedTasks = openTasks.filter((t) => isOverdue(s, t, now) || isNearTarget(s, t, now));

  const list = s.notifications.filter((n) => type === "all" || n.type === type);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications & Clinical Alerts"
        desc="Real-time alerts for task handovers, threshold delays and overdue escalations."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-48 text-xs" aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All alert types</SelectItem>
                {Object.entries(LABEL).map(([k, [l]]) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={s.markAllRead}>
              Mark all as read
            </Button>
          </div>
        }
      />

      {/* ACTIVE REAL-TIME CLINICAL ALERTS BANNER */}
      {delayedTasks.length > 0 && (
        <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Live Delay Warnings ({delayedTasks.length} tasks sitting near or past target)
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {delayedTasks.map((t) => {
              const d = getDept(s, t.deptId);
              const p = s.patients.find((x) => x.id === t.patientId);
              const isOver = isOverdue(s, t, now);
              const waitDur = fmtDur(waitingMs(t, now));
              const targetDur = `${d.thresholdMinutes}m`;

              return (
                <div key={t.id} className="rounded-xl border border-destructive/20 bg-card p-3 text-xs flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                      <span className="font-mono text-sm">{t.patientId}</span>
                      <span>· {t.title}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      <strong className={isOver ? "text-destructive" : "text-amber-600 font-semibold"}>
                        {isOver ? `Overdue: Waiting ${waitDur}, target ${targetDur}` : `Approaching threshold: Waiting ${waitDur}, target ${targetDur}`}
                      </strong>{" "}
                      in {d.name} ({t.assignee})
                    </div>
                  </div>

                  <Button size="sm" variant="ghost" asChild className="h-7 text-xs text-primary">
                    <Link to="/patients/$patientId" params={{ patientId: t.patientId }}>
                      View →
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notifications history list */}
      <div className="card-surface divide-y rounded-xl border">
        {list.length === 0 ? (
          <div className="p-6 text-center">
            <Empty>No notifications match the filter.</Empty>
          </div>
        ) : (
          list.map((n) => (
            <div key={n.id} className={cn("flex flex-wrap items-center gap-3 p-4 transition-colors", !n.read && "bg-accent/40")}>
              {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
              <Pill tone={LABEL[n.type]?.[1] || "muted"}>{LABEL[n.type]?.[0] || n.type}</Pill>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{n.message}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  <span className="font-mono font-semibold">{n.patientId}</span> · {deptName(s, n.deptId)} · {fmtTime(n.at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                  <Link to="/patients/$patientId" params={{ patientId: n.patientId }} onClick={() => s.markRead(n.id)}>
                    View
                  </Link>
                </Button>
                {!n.read && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => s.markRead(n.id)}>
                    Mark read
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
