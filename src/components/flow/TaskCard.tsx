import { Clock, User, CheckCircle2, AlertTriangle, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { deptName, exceededMs, isNearTarget, isOverdue, waitingMs } from "@/lib/workflow/engine";
import { useFlow } from "@/lib/workflow/store";
import type { Task } from "@/lib/workflow/types";
import { fmtDur, fmtTime, PriorityBadge, StatusBadge } from "./ui";

export function TaskCard({
  task,
  now,
  onOpen,
  showDept,
}: {
  task: Task;
  now: number;
  onOpen: (id: string) => void;
  showDept?: boolean;
}) {
  const { departments, patients } = useFlow();
  const patient = patients.find((p) => p.id === task.patientId);
  const overdue = isOverdue({ departments }, task, now);
  const nearTarget = isNearTarget({ departments }, task, now);
  const isCompleted = task.status === "completed";

  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className={cn(
        "group block w-full p-3.5 text-left rounded-xl transition-all border card-surface card-hover cursor-pointer box-border overflow-hidden min-w-0",
        overdue && "border-destructive/80 bg-destructive/5 dark:bg-destructive/15 shadow-xs shadow-destructive/10",
        nearTarget && !overdue && "border-amber-400 bg-amber-500/5 dark:bg-amber-500/15 shadow-xs shadow-amber-400/10",
        isCompleted && "border-success/40 bg-success-soft/30",
      )}
    >
      {/* Top Header: Patient ID & Treatment Badge & Priority */}
      <div className="flex items-start justify-between gap-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
          <span className="font-mono text-sm font-bold text-foreground shrink-0">{task.patientId}</span>
          {patient?.treatment && (
            <span
              className="inline-block max-w-[125px] truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
              title={patient.treatment}
            >
              {patient.treatment}
            </span>
          )}
        </div>
        <div className="shrink-0">
          <PriorityBadge p={task.priority} />
        </div>
      </div>

      {/* Patient Name & Age */}
      {patient?.label && (
        <div className="mt-1 text-xs font-semibold text-foreground/85 truncate" title={patient.label}>
          {patient.label} {patient.age ? <span className="font-normal text-muted-foreground text-[11px]">({patient.age}y)</span> : ""}
        </div>
      )}

      {/* Task Title */}
      <div className="mt-1.5 text-xs sm:text-sm font-medium text-foreground line-clamp-2 break-words leading-snug">
        {task.title}
      </div>
      {showDept && (
        <div className="mt-1 text-xs font-semibold text-primary truncate">
          {deptName({ departments }, task.deptId)}
        </div>
      )}

      {/* Timing and Assignee */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-muted-foreground border-t border-border/40 pt-2 min-w-0">
        <span className="flex items-center gap-1 min-w-0 truncate" title={`Assigned to: ${task.assignee}`}>
          <User className="h-3 w-3 shrink-0 text-muted-foreground/70" />
          <span className="truncate">{task.assignee}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0 text-[10px]" title={`Arrived: ${fmtTime(task.createdAt)}`}>
          <Clock className="h-3 w-3 shrink-0 text-muted-foreground/70" />
          <span>{fmtTime(task.createdAt)}</span>
        </span>
      </div>

      {/* Footer Badges & Target status */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-border/40 pt-1.5 min-w-0">
        <div className="shrink-0">
          <StatusBadge task={task} state={{ departments }} now={now} />
        </div>

        <div className="flex items-center gap-1 text-[11px] font-semibold shrink-0">
          {overdue && (
            <span className="flex items-center gap-1 text-destructive font-bold" title={`Overdue by ${fmtDur(exceededMs({ departments }, task, now))}`}>
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>+{fmtDur(exceededMs({ departments }, task, now))}</span>
            </span>
          )}
          {nearTarget && !overdue && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium" title="Approaching target time">
              <Hourglass className="h-3 w-3 shrink-0" />
              <span>{fmtDur(waitingMs(task, now))}</span>
            </span>
          )}
          {isCompleted && (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span>Done</span>
            </span>
          )}
          {!overdue && !nearTarget && !isCompleted && (
            <span className="text-muted-foreground text-[10px]" title={`Waiting: ${fmtDur(waitingMs(task, now))}`}>
              {fmtDur(waitingMs(task, now))}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
