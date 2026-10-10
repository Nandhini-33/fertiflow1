import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, Clock, CheckCircle2, Inbox } from "lucide-react";
import { AI_SAFETY_DISCLAIMER } from "@/lib/ai/assistant";
import { deptName, exceededMs, isNearTarget, isOverdue, waitingMs } from "@/lib/workflow/engine";
import type { WorkflowState } from "@/lib/workflow/types";

interface AISummarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: "pending" | "overdue" | "inprogress" | "completed" | null;
  state: WorkflowState;
  now: number;
}

export function AISummarySheet({ open, onOpenChange, category, state, now }: AISummarySheetProps) {
  if (!category) return null;

  const openTasks = state.tasks.filter((t) => t.status !== "completed");
  const overdueTasks = openTasks.filter((t) => isOverdue(state, t, now));
  const nearTargetTasks = openTasks.filter((t) => isNearTarget(state, t, now));
  const inProgressTasks = openTasks.filter((t) => t.status === "in_progress");
  const pendingTasks = openTasks.filter((t) => t.status === "incoming");

  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  const doneToday = state.tasks.filter((t) => t.completedAt && t.completedAt >= startOfDay);

  const getDetails = () => {
    switch (category) {
      case "overdue": {
        if (overdueTasks.length === 0) {
          return {
            title: "Overdue Tasks Insight",
            icon: <CheckCircle2 className="h-5 w-5 text-success" />,
            badge: "0 Overdue",
            badgeVariant: "outline" as const,
            headline: "All active patient tasks are progressing within standard clinical turnaround targets.",
            points: [
              "Zero department thresholds breached.",
              `${nearTargetTasks.length} task(s) currently near target turnaround limit.`,
            ],
            recommendation: "Continue standard monitoring. No emergency escalation required.",
          };
        }

        const sorted = [...overdueTasks].sort((a, b) => exceededMs(state, b, now) - exceededMs(state, a, now));
        const worst = sorted[0]!;
        const worstPatient = state.patients.find((p) => p.id === worst.patientId);
        const worstExceeded = Math.round(exceededMs(state, worst, now) / 3600000);
        const worstWait = Math.round(waitingMs(worst, now) / 3600000);
        const dept = deptName(state, worst.deptId);

        return {
          title: "Overdue Tasks Insight",
          icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
          badge: `${overdueTasks.length} Overdue`,
          badgeVariant: "destructive" as const,
          headline: `${overdueTasks.length} task${overdueTasks.length > 1 ? "s are" : " is"} overdue. The longest wait is ${worst.patientId} (${worstPatient?.label || "Patient"}, ${worstPatient?.treatment || "IVF"}) in ${dept}, ${worstExceeded > 0 ? `${worstExceeded}h over target` : "over target"}.`,
          points: overdueTasks.map((t) => {
            const p = state.patients.find((x) => x.id === t.patientId);
            const wH = (waitingMs(t, now) / 3600000).toFixed(1).replace(".0", "");
            const exH = (exceededMs(state, t, now) / 3600000).toFixed(1).replace(".0", "");
            return `${t.patientId} (${p?.treatment || "Treatment"}): in ${deptName(state, t.deptId)} — waiting ${wH}h (${exH}h past threshold). Assigned to ${t.assignee}.`;
          }),
          recommendation: `Expedite ${worst.patientId} in ${dept} to prevent compounding delays in subsequent treatment steps.`,
        };
      }

      case "pending": {
        const highPrio = pendingTasks.filter((t) => t.priority === "urgent" || t.priority === "high");
        return {
          title: "Pending Tasks Insight",
          icon: <Inbox className="h-5 w-5 text-primary" />,
          badge: `${pendingTasks.length} Awaiting Action`,
          badgeVariant: "default" as const,
          headline: `${pendingTasks.length} incoming task${pendingTasks.length > 1 ? "s are" : " is"} waiting to be picked up across clinic departments.`,
          points: [
            `${highPrio.length} high or urgent priority case${highPrio.length !== 1 ? "s" : ""}.`,
            `Average wait time in incoming status: ${(pendingTasks.reduce((acc, t) => acc + waitingMs(t, now), 0) / (pendingTasks.length || 1) / 60000).toFixed(0)} minutes.`,
            `Distributed across: ${Array.from(new Set(pendingTasks.map((t) => deptName(state, t.deptId)))).join(", ") || "None"}.`,
          ],
          recommendation: "Staff should start incoming tasks promptly to commence target timers accurately.",
        };
      }

      case "inprogress": {
        return {
          title: "In-Progress Tasks Insight",
          icon: <Clock className="h-5 w-5 text-amber-500" />,
          badge: `${inProgressTasks.length} In Progress`,
          badgeVariant: "secondary" as const,
          headline: `${inProgressTasks.length} task${inProgressTasks.length > 1 ? "s are" : " is"} actively undergoing clinical procedures, lab analyses or assessments.`,
          points: inProgressTasks.map((t) => {
            const p = state.patients.find((x) => x.id === t.patientId);
            const wH = (waitingMs(t, now) / 3600000).toFixed(1).replace(".0", "");
            return `${t.patientId} (${p?.treatment || "Treatment"}): ${t.title} by ${t.assignee} in ${deptName(state, t.deptId)} (active for ${wH}h).`;
          }),
          recommendation: "Ensure staff record timely work notes during procedures to maintain a clear audit trail.",
        };
      }

      case "completed": {
        const handoversToday = state.handovers.filter((h) => h.completedAt >= startOfDay);
        return {
          title: "Completed Today Insight",
          icon: <CheckCircle2 className="h-5 w-5 text-success" />,
          badge: `${doneToday.length} Completed Today`,
          badgeVariant: "outline" as const,
          headline: `${doneToday.length} task${doneToday.length !== 1 ? "s" : ""} completed today, resulting in ${handoversToday.length} successful automatic department handovers.`,
          points: [
            `Automatic handover success rate today: 100%.`,
            `Stages completed: ${Array.from(new Set(doneToday.map((t) => deptName(state, t.deptId)))).join(", ") || "None"}.`,
            `Completed workflows: ${state.patients.filter((p) => p.status === "completed" && p.completedAt && p.completedAt >= startOfDay).length} patients fully closed today.`,
          ],
          recommendation: "Handovers are operating smoothly. Handover records preserved in audit history.",
        };
      }
    }
  };

  const details = getDetails();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-lg font-semibold">{details.title}</SheetTitle>
              <SheetDescription>Automated AI analysis calculated from live clinic records</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="flex items-center gap-2">
            <Badge variant={details.badgeVariant as any}>{details.badge}</Badge>
            <span className="text-xs text-muted-foreground">Computed just now</span>
          </div>

          <div className="rounded-xl border border-primary/20 bg-accent/40 p-4">
            <div className="flex items-start gap-2.5">
              {details.icon}
              <p className="text-sm font-medium leading-relaxed">{details.headline}</p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live Breakdown</h4>
            <ul className="space-y-2">
              {details.points.map((pt, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg border bg-card p-2.5 text-xs">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-muted-foreground">{pt}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-muted/60 p-3.5 text-xs">
            <span className="font-semibold text-foreground">Operational Action: </span>
            <span className="text-muted-foreground">{details.recommendation}</span>
          </div>

          <div className="rounded-lg border border-border/80 bg-background/50 p-3 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Safety Notice: </span>
            {AI_SAFETY_DISCLAIMER}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
