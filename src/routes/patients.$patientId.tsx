import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Circle, Clock, AlertTriangle, CheckCircle2, Edit2, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TaskDialog } from "@/components/flow/TaskDialog";
import { EditPatientDialog } from "@/components/flow/EditPatientDialog";
import { HandoverNote } from "@/components/flow/HandoverNote";
import { Empty, fmtDur, fmtTime, PageHeader, Pill, PriorityBadge, Section, StatusBadge } from "@/components/flow/ui";
import { cn } from "@/lib/utils";
import { deptName, exceededMs, isOverdue, stageOrder, waitingMs } from "@/lib/workflow/engine";
import { useFlow, useNow } from "@/lib/workflow/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/patients/$patientId")({
  head: ({ params }) => meta(`Patient ${params.patientId}`, `Workflow timeline, tasks and handover notes for ${params.patientId}.`),
  component: PatientPage,
});

function PatientPage() {
  const { patientId } = Route.useParams();
  const s = useFlow();
  const { user } = useFlow();
  const now = useNow(15_000);
  const navigate = useNavigate();

  const [open, setOpen] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const p = s.patients.find((x) => x.id === patientId);
  if (!p) {
    return (
      <Empty>
        Patient workflow not found. <Link to="/patients" className="text-primary font-semibold">Back to patients</Link>
      </Empty>
    );
  }

  const tasks = s.tasks.filter((t) => t.patientId === p.id).sort((a, b) => b.createdAt - a.createdAt);
  const active = tasks.find((t) => t.status !== "completed");
  const order = stageOrder(s.config);
  const idx = p.status === "completed" ? order.length : order.indexOf(p.currentDept);
  const handovers = s.handovers.filter((h) => h.patientId === p.id);
  const activity = s.activity.filter((a) => a.patientId === p.id);
  const overdue = active && isOverdue(s, active, now);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${p.id} — ${p.label}`}
        desc={`${p.treatment || "Treatment"} · ${p.age ? `${p.age} years old · ` : ""}Admitted ${fmtTime(p.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {user.role === "admin" && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                Edit Profile
              </Button>
            )}
            {active && (
              <Button size="sm" onClick={() => setOpen(active.id)}>
                Open active task
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/patients">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to directory
              </Link>
            </Button>
          </div>
        }
      />

      {/* COMPLETED STATUS HERO CARD */}
      {p.status === "completed" && (
        <div className="rounded-2xl border-2 border-success/40 bg-success-soft/40 p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2 font-bold text-success text-base">
            <CheckCircle2 className="h-6 w-6" />
            <span className="rounded-full bg-success/20 px-2.5 py-0.5 text-xs font-bold text-success border border-success/40">
              Task completed
            </span>
            Workflow Finished Successfully
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All 6 clinical stages (Consultation, Sample Collection, Laboratory, Embryology, Procedure, Follow-up) have been completed.
            Post-procedure discharge confirmed on {p.completedAt ? fmtTime(p.completedAt) : "Today"}.
          </p>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card-surface p-4 rounded-xl border">
          <div className="text-xs text-muted-foreground">Overall Status</div>
          <div className="mt-1">
            {p.status === "completed" ? (
              <Pill tone="green">Task completed</Pill>
            ) : overdue ? (
              <Pill tone="red">Delayed</Pill>
            ) : (
              <Pill tone="pink">Active</Pill>
            )}
          </div>
        </div>

        <div className="card-surface p-4 rounded-xl border">
          <div className="text-xs text-muted-foreground">Current Department</div>
          <div className="mt-1 font-semibold">{p.status === "completed" ? "All completed" : deptName(s, p.currentDept)}</div>
        </div>

        <div className="card-surface p-4 rounded-xl border">
          <div className="text-xs text-muted-foreground">Current Stage</div>
          <div className="mt-1 font-semibold">{active?.title ?? "Workflow complete"}</div>
        </div>

        <div className="card-surface p-4 rounded-xl border">
          <div className="text-xs text-muted-foreground">Treatment & Priority</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{p.treatment || "IVF"}</span>
            <PriorityBadge p={p.priority} />
          </div>
        </div>
      </div>

      {/* Clinical Notes if present */}
      {p.note && (
        <div className="rounded-xl border bg-card p-4 text-xs">
          <span className="font-semibold text-foreground">Registered Referral Notes: </span>
          <span className="text-muted-foreground">{p.note}</span>
        </div>
      )}

      {/* Workflow Progress Timeline */}
      <Section title="Workflow Progress Across 6 Stages">
        <Progress value={(idx / order.length) * 100} className="mb-5 h-2" />
        <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {order.map((d, i) => {
            const st = i < idx ? "done" : i === idx ? (overdue ? "overdue" : "active") : "pending";
            const t = tasks.find((x) => x.deptId === d);
            return (
              <li
                key={d}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  st === "active" && "border-primary bg-accent/60 shadow-xs",
                  st === "overdue" && "border-destructive bg-danger-soft",
                  st === "done" && "bg-success-soft/50 border-success/30",
                )}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {st === "done" ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : st === "overdue" ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  ) : st === "active" ? (
                    <Clock className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  {deptName(s, d)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {st === "done" && t?.completedAt
                    ? `Done ${fmtTime(t.completedAt)}`
                    : st === "pending"
                    ? "Upcoming"
                    : t
                    ? `${t.assignee} · ${fmtDur(waitingMs(t, now))}`
                    : ""}
                </div>
              </li>
            );
          })}
        </ol>
        {overdue && active && (
          <p className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-destructive">
            Delay alert: waiting {fmtDur(waitingMs(active, now))}, exceeded threshold by {fmtDur(exceededMs(s, active, now))}. Recommended: contact {deptName(s, active.deptId)}.
          </p>
        )}
      </Section>

      {/* Task history & Activity timeline */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Task History">
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setOpen(t.id)}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm hover:bg-muted transition-colors card-surface"
                >
                  <div>
                    <div className="font-medium text-foreground">{t.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {deptName(s, t.deptId)} · {t.assignee} · {fmtTime(t.createdAt)}
                      {t.completedAt && ` → ${fmtTime(t.completedAt)}`}
                    </div>
                  </div>
                  <StatusBadge task={t} state={s} now={now} />
                </button>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Activity Timeline">
          <ol className="relative space-y-3 border-l pl-4 text-xs">
            {activity.map((a) => (
              <li key={a.id}>
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="text-[11px] text-muted-foreground">
                  {fmtTime(a.at)} · {a.actor}
                </div>
                <div className="text-foreground font-medium mt-0.5">{a.message}</div>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* Handover notes */}
      <Section title="Automatic Handover Notes">
        <div className="grid gap-4 md:grid-cols-2">
          {handovers.length ? (
            handovers.map((h) => <HandoverNote key={h.id} h={h} />)
          ) : (
            <Empty>No handovers recorded yet.</Empty>
          )}
        </div>
      </Section>

      <TaskDialog taskId={open} onClose={() => setOpen(null)} />
      <EditPatientDialog
        patient={p}
        open={editOpen}
        onOpenChange={setEditOpen}
        onDeleted={() => navigate({ to: "/patients" })}
      />
    </div>
  );
}
