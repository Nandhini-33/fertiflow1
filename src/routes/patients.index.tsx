import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { UserPlus, Edit2, Search, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fmtTime, PageHeader, Pill, PriorityBadge } from "@/components/flow/ui";
import { AddPatientDialog } from "@/components/flow/AddPatientDialog";
import { EditPatientDialog } from "@/components/flow/EditPatientDialog";
import { deptName, isOverdue, stageOrder } from "@/lib/workflow/engine";
import { useFlow, useNow } from "@/lib/workflow/store";
import type { Patient } from "@/lib/workflow/types";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/patients/")({
  head: () => meta("Patients", "Fictional patient workflow references and their progress through the clinic."),
  component: Patients,
});

function Patients() {
  const s = useFlow();
  const { user } = useFlow();
  const now = useNow();

  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);

  const order = stageOrder(s.config);
  const query = q.trim().toLowerCase();
  const list = s.patients.filter(
    (p) =>
      !query ||
      p.id.toLowerCase().includes(query) ||
      p.label.toLowerCase().includes(query) ||
      (p.treatment && p.treatment.toLowerCase().includes(query)),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Patients"
        desc="Fictional patient directory with clinical stage timelines and treatment tracking."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search patient ID, name, treatment…"
                className="w-64 pl-8 text-xs"
              />
            </div>

            {user.role === "admin" && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <UserPlus className="h-4 w-4 mr-1.5" />
                Add Patient
              </Button>
            )}
          </div>
        }
      />

      <div className="rounded-xl border border-primary/20 bg-accent/30 p-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Notice: </span>
        Demo mode: use fictional data only. Do not enter real patient data.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => {
          const idx = p.status === "completed" ? order.length : order.indexOf(p.currentDept);
          const open = s.tasks.find((t) => t.patientId === p.id && t.status !== "completed");
          const overdue = open && isOverdue(s, open, now);

          return (
            <div
              key={p.id}
              className={`card-surface rounded-2xl border p-4.5 transition-all hover:shadow-md ${
                p.status === "completed"
                  ? "border-success/30 bg-success-soft/20"
                  : overdue
                  ? "border-destructive/40 bg-destructive/5"
                  : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold text-foreground">{p.id}</span>
                  {p.treatment && (
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {p.treatment}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <PriorityBadge p={p.priority} />
                  {user.role === "admin" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Edit Patient"
                      onClick={() => setEditPatient(p)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-1">
                <span className="font-semibold text-sm text-foreground">{p.label}</span>
                {p.age && <span className="text-xs text-muted-foreground ml-1.5">({p.age} years)</span>}
              </div>

              <div className="mt-1 text-xs text-muted-foreground">
                {p.status === "completed" ? (
                  <span className="flex items-center gap-1 text-success font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    All 6 stages completed
                  </span>
                ) : (
                  <span>
                    Current stage: <strong className="text-foreground">{deptName(s, p.currentDept)}</strong>
                  </span>
                )}
              </div>

              <Progress value={(idx / order.length) * 100} className="mt-3.5 h-2" />

              <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Admitted {fmtTime(p.createdAt)}</span>
                {p.status === "completed" ? (
                  <Pill tone="green">Task completed</Pill>
                ) : overdue ? (
                  <Pill tone="red">Overdue</Pill>
                ) : (
                  <span>
                    Step {idx + 1} of {order.length}
                  </span>
                )}
              </div>

              <div className="mt-3 pt-2.5 border-t flex justify-end">
                <Link
                  to="/patients/$patientId"
                  params={{ patientId: p.id }}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  View patient history <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <AddPatientDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditPatientDialog
        patient={editPatient}
        open={!!editPatient}
        onOpenChange={(o) => !o && setEditPatient(null)}
      />
    </div>
  );
}
