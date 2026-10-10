import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { TaskCard } from "@/components/flow/TaskCard";
import { TaskDialog } from "@/components/flow/TaskDialog";
import { Empty, PageHeader, Pill } from "@/components/flow/ui";
import { deptName, isOverdue, isUserInDept } from "@/lib/workflow/engine";
import { useFlow, useNow } from "@/lib/workflow/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/departments/$deptId")({
  head: ({ params }) => meta(`${params.deptId} department`, "Incoming, in-progress, completed and overdue tasks for this department."),
  component: DeptPage,
});

function DeptPage() {
  const { deptId } = Route.useParams();
  const s = useFlow();
  const now = useNow(15_000);
  const [open, setOpen] = useState<string | null>(null);
  const dept = s.departments.find((d) => d.id === deptId);
  if (!dept) return <Empty>Department not found. <Link to="/departments" className="text-primary">Back</Link></Empty>;
  const tasks = s.tasks.filter((t) => t.deptId === dept.id);
  const od = tasks.filter((t) => isOverdue(s, t, now));
  const cols = [
    { title: "Incoming Tasks", items: tasks.filter((t) => t.status === "incoming" && !isOverdue(s, t, now)) },
    { title: "In Progress", items: tasks.filter((t) => t.status === "in_progress" && !isOverdue(s, t, now)) },
    { title: "Completed", items: tasks.filter((t) => t.status === "completed").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 12) },
    { title: "Overdue", items: od },
  ];
  const canAct = isUserInDept(s.user, dept.id);
  const step = s.config.steps.find((x) => x.deptId === dept.id);
  return (
    <div className="space-y-5">
      <PageHeader title={dept.name} desc={`Threshold ${dept.thresholdMinutes} min · completed tasks hand over automatically to ${deptName(s, step?.next)}.`}
        actions={canAct ? <Pill tone="green">You can act on these tasks</Pill> : <Pill tone="amber">View only for {s.user.name}</Pill>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cols.map((c) => (
          <div key={c.title} className="rounded-2xl bg-muted/60 p-3">
            <div className="mb-3 flex justify-between"><h3 className="text-sm font-semibold">{c.title}</h3><span className="rounded-full bg-card px-2 text-xs font-bold">{c.items.length}</span></div>
            <div className="space-y-3">{c.items.length ? c.items.map((t) => <TaskCard key={t.id} task={t} now={now} onOpen={setOpen} />) : <Empty>Nothing here</Empty>}</div>
          </div>
        ))}
      </div>
      <TaskDialog taskId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
