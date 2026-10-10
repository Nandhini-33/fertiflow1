import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHeader, Pill } from "@/components/flow/ui";
import { isOverdue, stageOrder, deptName } from "@/lib/workflow/engine";
import { useFlow, useNow } from "@/lib/workflow/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/departments/")({
  head: () => meta("Departments", "Department dashboards for consultation, sample collection, laboratory, embryology, procedures and follow-up."),
  component: Departments,
});

function Departments() {
  const s = useFlow();
  const now = useNow();
  const order = stageOrder(s.config);
  const depts = [...s.departments].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return (
    <div>
      <PageHeader title="Departments" desc="Open a department to work its incoming queue." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {depts.map((d) => {
          const t = s.tasks.filter((x) => x.deptId === d.id);
          const open = t.filter((x) => x.status !== "completed");
          const od = open.filter((x) => isOverdue(s, x, now)).length;
          const step = s.config.steps.find((x) => x.deptId === d.id);
          return (
            <Link key={d.id} to="/departments/$deptId" params={{ deptId: d.id }} className="card-surface card-hover block p-5">
              <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{d.name}</h2><ArrowRight className="h-4 w-4 text-primary" /></div>
              <p className="text-xs text-muted-foreground">Hands over to {deptName(s, step?.next)} · threshold {d.thresholdMinutes} min</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat n={open.filter((x) => x.status === "incoming").length} l="Incoming" />
                <Stat n={open.filter((x) => x.status === "in_progress").length} l="In progress" />
                <Stat n={t.filter((x) => x.status === "completed").length} l="Completed" />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{d.staff.join(", ")}</span>{od > 0 && <Pill tone="red">{od} overdue</Pill>}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
const Stat = ({ n, l }: { n: number; l: string }) => (
  <div className="rounded-lg bg-muted p-2"><div className="font-display text-xl font-semibold">{n}</div><div className="text-[10px] text-muted-foreground">{l}</div></div>
);
