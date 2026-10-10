import { createFileRoute, Link } from "@tanstack/react-router";
import { LayoutGrid, List, UserPlus, CheckCircle2, Sparkles, Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TaskCard } from "@/components/flow/TaskCard";
import { TaskDialog } from "@/components/flow/TaskDialog";
import { AddPatientDialog } from "@/components/flow/AddPatientDialog";
import { Empty, fmtDur, fmtTime, PageHeader, PriorityBadge, StatusBadge, Pill } from "@/components/flow/ui";
import { deptName, isNearTarget, isOverdue, stageOrder, waitingMs } from "@/lib/workflow/engine";
import { useFlow, useNow } from "@/lib/workflow/store";
import type { Task } from "@/lib/workflow/types";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/board")({
  head: () => meta("Workflow Board", "Six-stage clinical workflow board with live automatic handover and stage tracking."),
  component: Board,
});

export function useTaskFilters(tasks: Task[], now: number) {
  const s = useFlow();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [prio, setPrio] = useState("all");
  const [sort, setSort] = useState("oldest");

  const filtered = useMemo(() => {
    const r = tasks.filter((t) => {
      const p = s.patients.find((x) => x.id === t.patientId);
      const matchesQuery =
        !q ||
        t.patientId.toLowerCase().includes(q.toLowerCase()) ||
        (p?.label && p.label.toLowerCase().includes(q.toLowerCase())) ||
        (p?.treatment && p.treatment.toLowerCase().includes(q.toLowerCase()));

      const matchesDept = dept === "all" || t.deptId === dept;
      const matchesPrio = prio === "all" || t.priority === prio;

      const matchesStatus =
        status === "all" ||
        (status === "overdue"
          ? isOverdue(s, t, now)
          : status === "near_target"
          ? isNearTarget(s, t, now)
          : t.status === status);

      return matchesQuery && matchesDept && matchesPrio && matchesStatus;
    });

    return r.sort((a, b) => (sort === "oldest" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt));
  }, [tasks, q, dept, status, prio, sort, now, s]);

  const controls = (
    <div className="card-surface flex flex-wrap items-center gap-2.5 p-3 sm:p-3.5 rounded-xl border">
      <Input
        placeholder="Search patient ID, name, treatment…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full sm:w-56 text-xs"
      />
      <F
        v={dept}
        set={setDept}
        label="Department"
        opts={[["all", "All 6 stages"], ...s.departments.map((d) => [d.id, d.name] as [string, string])]}
      />
      <F
        v={status}
        set={setStatus}
        label="Status"
        opts={[
          ["all", "All statuses"],
          ["incoming", "Incoming"],
          ["in_progress", "In progress"],
          ["near_target", "Near target (Yellow)"],
          ["overdue", "Overdue (Red)"],
        ]}
      />
      <F
        v={prio}
        set={setPrio}
        label="Priority"
        opts={[
          ["all", "All priorities"],
          ["urgent", "Urgent"],
          ["high", "High"],
          ["normal", "Normal"],
          ["low", "Low"],
        ]}
      />
      <F
        v={sort}
        set={setSort}
        label="Sort"
        opts={[
          ["oldest", "Oldest waiting first"],
          ["newest", "Newest first"],
        ]}
      />
    </div>
  );
  return { filtered, controls };
}

function F({ v, set, opts, label }: { v: string; set: (v: string) => void; opts: [string, string][]; label: string }) {
  return (
    <Select value={v} onValueChange={set}>
      <SelectTrigger className="w-full sm:w-auto sm:min-w-36 text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opts.map(([k, l]) => (
          <SelectItem key={k} value={k} className="text-xs">
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Board() {
  const s = useFlow();
  const { user } = useFlow();
  const now = useNow();

  const [open, setOpen] = useState<string | null>(null);
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [view, setView] = useState<"board" | "list">("board");
  const [showCompleted, setShowCompleted] = useState(false);

  const active = s.tasks.filter((t) => t.status !== "completed");
  const { filtered, controls } = useTaskFilters(active, now);
  const order = stageOrder(s.config);

  const completedPatients = s.patients.filter((p) => p.status === "completed");

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader
        title="Workflow Board"
        desc="Six columns track each patient's active step with real-time automatic handover across departments."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {user.role === "admin" && (
              <Button size="sm" onClick={() => setAddPatientOpen(true)}>
                <UserPlus className="h-4 w-4 mr-1.5" />
                Add Patient
              </Button>
            )}

            <Button
              size="sm"
              variant={showCompleted ? "default" : "outline"}
              onClick={() => setShowCompleted(!showCompleted)}
              className="text-xs"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Completed ({completedPatients.length})
            </Button>

            <div className="flex rounded-lg border bg-card p-0.5">
              <Button
                size="sm"
                variant={view === "board" ? "default" : "ghost"}
                onClick={() => setView("board")}
                className="h-7 text-xs"
              >
                <LayoutGrid className="h-3.5 w-3.5 mr-1" />
                Board
              </Button>
              <Button
                size="sm"
                variant={view === "list" ? "default" : "ghost"}
                onClick={() => setView("list")}
                className="h-7 text-xs"
              >
                <List className="h-3.5 w-3.5 mr-1" />
                List
              </Button>
            </div>
          </div>
        }
      />

      {controls}

      {/* COMPLETED PATIENTS HERO STRIP (WHEN TOGGLED) */}
      {showCompleted && (
        <div className="rounded-2xl border border-success/30 bg-success-soft/30 p-4 space-y-3 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-success">
              <CheckCircle2 className="h-5 w-5" />
              Completed Workflows — Final Stage Finished
            </div>
            <span className="text-xs font-semibold text-success">
              {completedPatients.length} patient case{completedPatients.length !== 1 ? "s" : ""} closed
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {completedPatients.map((p) => (
              <div key={p.id} className="card-surface rounded-xl border border-success/40 p-3.5 text-xs space-y-2 min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                    <span className="font-mono font-bold text-sm shrink-0">{p.id}</span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary truncate max-w-[120px]" title={p.treatment}>
                      {p.treatment}
                    </span>
                  </div>
                  {/* GREEN TASK COMPLETED BADGE */}
                  <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success border border-success/30 shrink-0">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    Task completed
                  </span>
                </div>

                <div className="font-semibold text-foreground truncate" title={`${p.label} (${p.age}y)`}>
                  {p.label} ({p.age}y)
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed break-words line-clamp-2">
                  Case finalized. All 6 clinical stages successfully concluded and post-procedure follow-up confirmed.
                </p>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40 min-w-0">
                  <span>Closed: {p.completedAt ? fmtTime(p.completedAt) : "Today"}</span>
                  <Link to="/patients/$patientId" params={{ patientId: p.id }} className="font-semibold text-primary hover:underline shrink-0">
                    View timeline →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6 STAGES KANBAN BOARD */}
      {view === "board" ? (
        <div className="w-full min-w-0">
          <div className="w-full overflow-x-auto pb-5 pt-1 kanban-scroll rounded-2xl focus:outline-none">
            <div className="flex gap-4 min-w-max items-start pb-1">
              {order.map((d, index) => {
                const col = filtered.filter((t) => t.deptId === d);
                const deptObj = s.departments.find((x) => x.id === d);

                return (
                  <div
                    key={d}
                    className="w-[300px] min-w-[300px] max-w-[300px] shrink-0 rounded-2xl bg-muted/40 dark:bg-muted/20 border border-border/80 p-3.5 flex flex-col shadow-xs"
                  >
                    {/* Stage Header */}
                    <div className="mb-3 border-b border-border/80 pb-2.5 space-y-1.5 min-w-0">
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                            <span>Stage {index + 1} of 6</span>
                          </div>
                          <h3 className="mt-0.5 text-sm font-bold text-foreground truncate" title={deptName(s, d)}>
                            {deptName(s, d)}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-card text-xs font-bold text-foreground border border-border/70 shadow-xs"
                            title={`${col.length} active patient${col.length !== 1 ? "s" : ""}`}
                          >
                            {col.length}
                          </span>
                        </div>
                      </div>

                      {/* Sub-line: Target time & Assigned staff */}
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground pt-0.5 min-w-0">
                        <span className="flex items-center gap-1 font-medium truncate" title={`Target turnaround: ${deptObj?.thresholdMinutes ?? 60} minutes`}>
                          <Clock className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                          <span>Target: {deptObj?.thresholdMinutes ? `${deptObj.thresholdMinutes}m` : "60m"}</span>
                        </span>
                        {deptObj?.staff?.length ? (
                          <span
                            className="truncate text-[10px] bg-background/80 rounded px-1.5 py-0.5 border border-border/50 shrink-0 font-medium max-w-[110px]"
                            title={`Staff: ${deptObj.staff.join(", ")}`}
                          >
                            {deptObj.staff[0].split(" ")[0]} et al.
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Patient Cards Stack */}
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-270px)] min-h-[160px] pr-1 kanban-scroll">
                      {col.length ? (
                        col.map((t) => <TaskCard key={t.id} task={t} now={now} onOpen={setOpen} />)
                      ) : (
                        <div className="h-28 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 p-4 text-center">
                          <p className="text-xs text-muted-foreground/80 font-medium">No active tasks</p>
                          <span className="text-[10px] text-muted-foreground/60 mt-0.5">Stage clear</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="card-surface overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient ID</TableHead>
                <TableHead>Treatment</TableHead>
                <TableHead>Stage / Task</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Waiting</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const p = s.patients.find((x) => x.id === t.patientId);
                const isOver = isOverdue(s, t, now);
                const isNear = isNearTarget(s, t, now);

                return (
                  <TableRow key={t.id} className={isOver ? "bg-destructive/5" : isNear ? "bg-amber-500/5" : ""}>
                    <TableCell className="font-mono font-bold text-foreground">{t.patientId}</TableCell>
                    <TableCell>
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                        {p?.treatment || "IVF"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{t.title}</div>
                      <div className="text-[11px] text-muted-foreground">{p?.label}</div>
                    </TableCell>
                    <TableCell>{deptName(s, t.deptId)}</TableCell>
                    <TableCell>
                      <StatusBadge task={t} state={s} now={now} />
                    </TableCell>
                    <TableCell>{t.assignee}</TableCell>
                    <TableCell className={isOver ? "font-bold text-destructive" : isNear ? "font-semibold text-amber-600" : ""}>
                      {fmtDur(waitingMs(t, now))}
                    </TableCell>
                    <TableCell>
                      <PriorityBadge p={t.priority} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(t.id)}>
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!filtered.length && <div className="p-4"><Empty>No tasks match these filters.</Empty></div>}
        </div>
      )}

      <TaskDialog taskId={open} onClose={() => setOpen(null)} />
      <AddPatientDialog open={addPatientOpen} onOpenChange={setAddPatientOpen} />
    </div>
  );
}
