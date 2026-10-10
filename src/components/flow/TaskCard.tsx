import { Clock, User, CheckCircle2, AlertTriangle, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { deptName, isNearTarget, isOverdue, waitingMs } from "@/lib/workflow/engine";
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
        "card-surface card-hover w-full p-3.5 text-left rounded-xl transition-all border",
        overdue && "border-destructive bg-destructive/5 dark:bg-destructive/15 shadow-sm shadow-destructive/10",
        nearTarget && !overdue && "border-amber-400 bg-amber-500/5 dark:bg-amber-500/15 shadow-sm shadow-amber-400/10",
        isCompleted && "border-success/40 bg-success-soft/30",
      )}
    >
      {/* Top Header: Patient ID & Treatment */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-bold text-foreground">{task.patientId}</span>
          {patient?.treatment && (
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {patient.treatment}
            </span>
          )}
        </div>
        <PriorityBadge p={task.priority} />
      </div>

      {/* Patient Name if available */}
      {patient?.label && (
        <div className="text-xs font-semibold text-foreground/80 mt-0.5 truncate">
          {patient.label} {patient.age ? `(${patient.age}y)` : ""}
        </div>
      )}

      {/* Task Title */}
      <div className="mt-1 text-sm font-medium text-foreground line-clamp-2">{task.title}</div>
      {showDept && <div className="text-xs font-semibold text-primary">{deptName({ departments }, task.deptId)}</div>}

      {/* Timing and Assignee */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {task.assignee}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {fmtTime(task.createdAt)}
        </span>
      </div>

      {/* Footer Badges & Target status */}
      <div className="mt-2.5 flex items-center justify-between border-t pt-2">
        <StatusBadge task={task} state={{ departments }} now={now} />

        <div className="flex items-center gap-1 text-xs font-semibold">
          {overdue && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              Overdue
            </span>
          )}
          {nearTarget && !overdue && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Hourglass className="h-3.5 w-3.5" />
              Near target
            </span>
          )}
          {isCompleted && (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Done
            </span>
          )}
          {!overdue && !nearTarget && !isCompleted && (
            <span className="text-muted-foreground">{fmtDur(waitingMs(task, now))}</span>
          )}
        </div>
      </div>
    </button>
  );
}
