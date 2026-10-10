import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  Hourglass,
  Inbox,
  KanbanSquare,
  Mic,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TaskCard } from "@/components/flow/TaskCard";
import { TaskDialog } from "@/components/flow/TaskDialog";
import { AISummarySheet } from "@/components/flow/AISummarySheet";
import { VoiceAssistantModal } from "@/components/flow/VoiceAssistantModal";
import { Empty, fmtAgo, fmtDur, PageHeader, Pill, Section } from "@/components/flow/ui";
import { deptName, exceededMs, isNearTarget, isOverdue, isUserInDept, stageOrder, waitingMs } from "@/lib/workflow/engine";
import { useFlow, useNow } from "@/lib/workflow/store";
import { AI_SAFETY_DISCLAIMER } from "@/lib/ai/assistant";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/")({
  head: () => meta("Overview", "Live operational dashboard for fertility clinic workflows, handovers and delays."),
  component: Overview,
});

const DAY = 86_400_000;

function Overview() {
  const s = useFlow();
  const { user, complete } = useFlow();
  const now = useNow();

  const [openTaskDialog, setOpenTaskDialog] = useState<string | null>(null);
  const [summaryCategory, setSummaryCategory] = useState<"pending" | "overdue" | "inprogress" | "completed" | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const openTasks = s.tasks.filter((t) => t.status !== "completed");
  const overdue = openTasks.filter((t) => isOverdue(s, t, now));
  const inProgress = openTasks.filter((t) => t.status === "in_progress");
  const pending = openTasks.filter((t) => t.status === "incoming");

  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  const doneToday = s.tasks.filter((t) => t.completedAt && t.completedAt >= startOfDay);

  const order = stageOrder(s.config);

  // My Tasks list (filtered for current logged in user's role/departments)
  const myTasks = openTasks.filter((t) => isUserInDept(user, t.deptId));

  // Critical Now items
  const criticalItems = [...overdue].sort((a, b) => exceededMs(s, b, now) - exceededMs(s, a, now));

  // Dynamic greeting based on user role
  const getGreeting = () => {
    switch (user.role) {
      case "doctor":
        return "Good morning, Doctors team (Consultation & Procedure)";
      case "nurse":
        return "Good morning, Nursing team (Sample & Follow-up)";
      case "lab":
        return "Good morning, Laboratory team";
      case "embryology":
        return "Good morning, Embryology team";
      case "admin":
      default:
        return "Good morning, Clinic Admin";
    }
  };

  const handleOpenSummary = (cat: "pending" | "overdue" | "inprogress" | "completed") => {
    setSummaryCategory(cat);
    setSummaryOpen(true);
  };

  const handleMarkDone = (taskId: string) => {
    const res = complete(taskId);
    if (res.ok) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  const workload = order.map((d) => ({
    name: deptName(s, d).split(" ")[0],
    Incoming: openTasks.filter((t) => t.deptId === d && t.status === "incoming").length,
    "In progress": openTasks.filter((t) => t.deptId === d && t.status === "in_progress").length,
  }));

  const trend = Array.from({ length: 7 }, (_, i) => {
    const dayStart = startOfDay - (6 - i) * DAY;
    return {
      day: new Date(dayStart).toLocaleDateString("en", { weekday: "short" }),
      Completed: s.tasks.filter((t) => t.completedAt && t.completedAt >= dayStart && t.completedAt < dayStart + DAY).length,
    };
  });

  return (
    <div className="space-y-6">
      {/* Greeting Header */}
      <PageHeader
        title={getGreeting()}
        desc={`Logged in as ${user.name} (${user.departmentLabel || user.role}). Fictional demo clinic records.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVoiceOpen(true)}
              className="flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            >
              <Mic className="h-4 w-4" />
              <span>Voice AI Assistant</span>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/tasks">
                <Inbox className="h-4 w-4" />
                All Tasks
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/board">
                <KanbanSquare className="h-4 w-4" />
                Workflow Board
              </Link>
            </Button>
          </div>
        }
      />

      {/* 1. BIG NUMBER CARDS WITH ARROW BUTTON FOR AI SUMMARY */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Pending Tasks Card */}
        <div className="card-surface relative rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending Tasks</span>
            <button
              type="button"
              onClick={() => handleOpenSummary("pending")}
              className="group flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              title="Open AI Summary"
            >
              <Sparkles className="h-3 w-3" />
              <span>AI Insight</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-foreground">{pending.length}</span>
            <span className="text-xs text-muted-foreground">awaiting action</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <Inbox className="h-3.5 w-3.5 text-amber-500" />
            <span>Across all 6 clinical departments</span>
          </div>
        </div>

        {/* Overdue Tasks Card */}
        <div className="card-surface relative rounded-2xl border border-destructive/30 bg-destructive/5 p-4 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-destructive">Overdue Tasks</span>
            <button
              type="button"
              onClick={() => handleOpenSummary("overdue")}
              className="group flex items-center gap-1 rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
              title="Open AI Summary"
            >
              <Sparkles className="h-3 w-3" />
              <span>AI Insight</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-destructive">{overdue.length}</span>
            <span className="text-xs text-destructive/80 font-medium">breached targets</span>
          </div>
          <div className="mt-2 text-xs text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Longest wait: P-1042 in Laboratory (3h over)</span>
          </div>
        </div>

        {/* In Progress Tasks Card */}
        <div className="card-surface relative rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">In Progress</span>
            <button
              type="button"
              onClick={() => handleOpenSummary("inprogress")}
              className="group flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              title="Open AI Summary"
            >
              <Sparkles className="h-3 w-3" />
              <span>AI Insight</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-foreground">{inProgress.length}</span>
            <span className="text-xs text-muted-foreground">currently active</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>Under review by assigned staff</span>
          </div>
        </div>

        {/* Completed Today Card */}
        <div className="card-surface relative rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completed Today</span>
            <button
              type="button"
              onClick={() => handleOpenSummary("completed")}
              className="group flex items-center gap-1 rounded-lg border border-success/30 bg-success-soft px-2 py-1 text-[11px] font-semibold text-success transition-colors hover:bg-success hover:text-primary-foreground"
              title="Open AI Summary"
            >
              <Sparkles className="h-3 w-3" />
              <span>AI Insight</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-success">{doneToday.length}</span>
            <span className="text-xs text-muted-foreground">tasks closed</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            <span>Automatic handovers: {s.handovers.filter((h) => h.status === "success").length} total</span>
          </div>
        </div>
      </div>

      {/* 2. "CRITICAL NOW" SECTION: WHAT, WHEN, WHERE */}
      <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Critical Now — Urgent Clinical Delays
          </div>
          <span className="rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-bold text-destructive">
            {criticalItems.length} Critical Issue{criticalItems.length !== 1 ? "s" : ""}
          </span>
        </div>

        {criticalItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No critical delays at this moment. All open tasks are within acceptable department thresholds.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {criticalItems.map((task) => {
              const p = s.patients.find((x) => x.id === task.patientId);
              const dept = deptName(s, task.deptId);
              const waited = fmtDur(waitingMs(task, now));
              const exceeded = fmtDur(exceededMs(s, task, now));

              return (
                <div key={task.id} className="rounded-xl border border-destructive/20 bg-card p-3.5 text-xs space-y-1.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-foreground">{task.patientId}</span>
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                      Overdue by {exceeded}
                    </span>
                  </div>

                  <div className="space-y-1 text-muted-foreground">
                    <div>
                      <strong className="text-foreground">WHAT: </strong>
                      {task.title} for {p?.label || "Patient"} ({p?.treatment || "IVF"})
                    </div>
                    <div>
                      <strong className="text-foreground">WHERE: </strong>
                      {dept} Department
                    </div>
                    <div>
                      <strong className="text-foreground">WHEN: </strong>
                      Waiting {waited} (exceeded target {exceeded} ago)
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t text-[11px]">
                    <span className="text-muted-foreground">Staff: {task.assignee}</span>
                    <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:bg-destructive/10" onClick={() => setOpenTaskDialog(task.id)}>
                      Review Case →
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-2 border-t border-destructive/10 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <span>{AI_SAFETY_DISCLAIMER}</span>
        </div>
      </div>

      {/* 3. "MY TASKS" WITH "MARK DONE" BUTTON AND CLEAR EMPTY STATE */}
      <Section
        title={`My Tasks (${user.departmentLabel || user.role})`}
        action={
          <span className="text-xs text-muted-foreground">
            {myTasks.length} active task{myTasks.length !== 1 ? "s" : ""}
          </span>
        }
      >
        {myTasks.length === 0 ? (
          <div className="card-surface rounded-2xl p-8 text-center border">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success opacity-80" />
            <h4 className="mt-2 font-display text-base font-semibold">No pending tasks for your department</h4>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              You are all caught up! When preceding departments complete their handovers, new incoming tasks will automatically appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myTasks.map((t) => {
              const p = s.patients.find((x) => x.id === t.patientId);
              const overdueTask = isOverdue(s, t, now);
              const nearTarget = isNearTarget(s, t, now);

              return (
                <div
                  key={t.id}
                  className={`card-surface rounded-xl p-3.5 border transition-all ${
                    overdueTask ? "border-destructive/60 bg-destructive/5" : nearTarget ? "border-amber-400 bg-amber-500/5" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sm">{t.patientId}</span>
                      {p?.treatment && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {p.treatment}
                        </span>
                      )}
                    </div>
                    {overdueTask && <Pill tone="red">Overdue</Pill>}
                    {nearTarget && !overdueTask && <Pill tone="amber">Near target</Pill>}
                  </div>

                  <div className="mt-1 text-xs font-semibold text-foreground/90">{p?.label}</div>
                  <div className="text-xs font-medium text-foreground line-clamp-1 mt-0.5">{t.title}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2">
                    <span>{deptName(s, t.deptId)}</span>
                    <span>·</span>
                    <span>Waiting: {fmtDur(waitingMs(t, now))}</span>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t pt-2.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpenTaskDialog(t.id)}>
                      Details
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={() => handleMarkDone(t.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Mark Done
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Live Workflow Stages Grid */}
      <Section title="Live workflow overview">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {order.map((d, i) => {
            const n = openTasks.filter((t) => t.deptId === d);
            const od = n.filter((t) => isOverdue(s, t, now)).length;
            return (
              <Link key={d} to="/departments/$deptId" params={{ deptId: d }} className="card-hover rounded-xl border bg-muted/50 p-3">
                <div className="text-[11px] text-muted-foreground">Step {i + 1}</div>
                <div className="text-sm font-semibold">{deptName(s, d)}</div>
                <div className="mt-1 font-display text-2xl font-semibold">
                  {n.length}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">pending</span>
                </div>
                {od > 0 && <Pill tone="red">{od} overdue</Pill>}
              </Link>
            );
          })}
        </div>
      </Section>

      {/* Analytics Visual Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Workload by department">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={workload}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Bar dataKey="Incoming" stackId="a" fill="var(--chart-2)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="In progress" stackId="a" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Task completion trend (7 days)">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Line type="monotone" dataKey="Completed" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      {/* Recent Activity and Handovers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Recent automatic handovers" action={<Link to="/handovers" className="text-xs font-semibold text-primary">View all →</Link>}>
          <ul className="space-y-3">
            {s.handovers.slice(0, 5).map((h) => (
              <li key={h.id} className="rounded-lg border p-3 text-sm card-surface">
                <div className="flex justify-between items-center">
                  <span className="font-mono font-semibold">{h.patientId}</span>
                  <span className="text-[11px] text-muted-foreground">{fmtAgo(h.completedAt)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {deptName(s, h.fromDept)} → {h.toDept ? deptName(s, h.toDept) : "Workflow complete"}
                </div>
                <div className="text-[11px] text-foreground mt-0.5 font-medium">{h.completedTaskTitle}</div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Recent workflow audit trail">
          <ul className="space-y-2.5">
            {s.activity.slice(0, 5).map((a) => (
              <li key={a.id} className="rounded-lg border p-2.5 text-xs card-surface flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{a.message}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {a.actor} · {fmtAgo(a.at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* Modals */}
      <TaskDialog taskId={openTaskDialog} onClose={() => setOpenTaskDialog(null)} />
      <AISummarySheet
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        category={summaryCategory}
        state={s}
        now={now}
      />
      <VoiceAssistantModal open={voiceOpen} onOpenChange={setVoiceOpen} />
    </div>
  );
}
