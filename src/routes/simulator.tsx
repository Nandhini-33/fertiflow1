import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Waves, AlertTriangle, ArrowRight, Clock, ShieldCheck, CheckCircle2 } from "lucide-react";
import { PageHeader, Section, Pill, Empty, fmtDur } from "@/components/flow/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFlow, useNow } from "@/lib/workflow/store";
import { deptName, stageOrder, waitingMs } from "@/lib/workflow/engine";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/simulator")({
  head: () => meta("Ripple Simulator", "Simulate the cascade impact of department delays on downstream clinical stages."),
  component: RippleSimulator,
});

function RippleSimulator() {
  const state = useFlow();
  const now = useNow();

  const [selectedDept, setSelectedDept] = useState<string>("laboratory");
  const [delayHours, setDelayHours] = useState<number>(3);

  const order = stageOrder(state.config);
  const selectedIndex = order.indexOf(selectedDept as any);
  const downstreamDepts = useMemo(() => {
    if (selectedIndex === -1) return [];
    return order.slice(selectedIndex + 1);
  }, [order, selectedIndex]);

  // Compute ripple impact without mutating real state
  const simulationResults = useMemo(() => {
    const delayMs = delayHours * 3600_000;
    const activeTasks = state.tasks.filter((t) => t.status !== "completed");

    // Patients currently in or before the delayed department
    const affectedPatients = state.patients.filter((p) => {
      if (p.status === "completed") return false;
      const pIdx = order.indexOf(p.currentDept);
      return pIdx <= selectedIndex;
    });

    const downstreamImpact = affectedPatients.map((p) => {
      const curTask = activeTasks.find((t) => t.patientId === p.id);
      const curWait = curTask ? waitingMs(curTask, now) : 0;
      const simulatedWait = curWait + delayMs;
      const targetDept = state.departments.find((d) => d.id === (curTask?.deptId || selectedDept));
      const targetThreshold = (targetDept?.thresholdMinutes || 120) * 60_000;
      const willBeOverdue = simulatedWait > targetThreshold;

      const downstreamStagesList = downstreamDepts.map((dId) => deptName(state, dId));

      return {
        patientId: p.id,
        patientName: p.label,
        treatment: p.treatment || "Treatment",
        currentDept: deptName(state, p.currentDept),
        currentWait: curWait,
        simulatedWait,
        additionalDelayHours: delayHours,
        willBeOverdue,
        downstreamStages: downstreamStagesList,
      };
    });

    return {
      affectedCount: affectedPatients.length,
      newOverdueCount: downstreamImpact.filter((x) => x.willBeOverdue).length,
      impactList: downstreamImpact,
    };
  }, [state, now, selectedDept, delayHours, order, selectedIndex, downstreamDepts]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ripple Simulator"
        desc="Clinical operations modeling: test how a bottleneck in one department creates cascading delays downstream."
        actions={
          <div className="flex items-center gap-2">
            <Pill tone="amber">Simulation only. No real data is changed.</Pill>
          </div>
        }
      />

      <div className="rounded-xl border border-primary/20 bg-accent/40 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Safe Sandbox Mode: </span>
            This tool computes projection curves in memory. Real patient appointments, target thresholds, and active handover queues are strictly preserved and unaffected.
          </div>
        </div>
      </div>

      {/* Simulator parameters controls */}
      <div className="grid gap-6 md:grid-cols-12 card-surface p-5 rounded-2xl">
        <div className="md:col-span-5 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            1. Source Bottleneck Department
          </label>
          <Select value={selectedDept} onValueChange={setSelectedDept}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {state.departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} (Target: {d.thresholdMinutes} min)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Downstream stages: {downstreamDepts.map((d) => deptName(state, d)).join(" → ") || "Final stage (no downstream)"}
          </p>
        </div>

        <div className="md:col-span-7 space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              2. Hypothetical Delay Duration
            </label>
            <span className="text-sm font-display font-bold text-primary">
              +{delayHours} hour{delayHours > 1 ? "s" : ""} delay
            </span>
          </div>
          <Slider
            value={[delayHours]}
            onValueChange={(vals) => setDelayHours(vals[0] || 1)}
            min={1}
            max={8}
            step={0.5}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>+1 hr (minor delay)</span>
            <span>+4 hrs (half day)</span>
            <span>+8 hrs (full clinical shift)</span>
          </div>
        </div>
      </div>

      {/* Summary metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card-surface p-4 rounded-xl border">
          <div className="text-xs text-muted-foreground">Affected Patients</div>
          <div className="mt-1 font-display text-2xl font-bold">{simulationResults.affectedCount}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Patients at or before {deptName(state, selectedDept as any)}</div>
        </div>

        <div className="card-surface p-4 rounded-xl border">
          <div className="text-xs text-muted-foreground">Projected Overdue Cases</div>
          <div className="mt-1 font-display text-2xl font-bold text-destructive">
            {simulationResults.newOverdueCount}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Would breach stage targets under this delay</div>
        </div>

        <div className="card-surface p-4 rounded-xl border">
          <div className="text-xs text-muted-foreground">Downstream Stages Affected</div>
          <div className="mt-1 font-display text-2xl font-bold text-primary">
            {downstreamDepts.length}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {downstreamDepts.map((d) => deptName(state, d)).join(", ") || "None"}
          </div>
        </div>
      </div>

      {/* Detailed patient ripple table */}
      <Section title="Projected Cascade Impact on Patient Workflows">
        {simulationResults.impactList.length === 0 ? (
          <Empty>No active patients would be affected by a delay in this department.</Empty>
        ) : (
          <div className="card-surface overflow-x-auto rounded-xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient ID</TableHead>
                  <TableHead>Treatment</TableHead>
                  <TableHead>Current Stage</TableHead>
                  <TableHead>Current Waiting</TableHead>
                  <TableHead>Simulated Wait (+{delayHours}h)</TableHead>
                  <TableHead>Downstream Impact</TableHead>
                  <TableHead>Target Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {simulationResults.impactList.map((row) => (
                  <TableRow key={row.patientId}>
                    <TableCell className="font-mono font-bold">{row.patientId}</TableCell>
                    <TableCell>
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                        {row.treatment}
                      </span>
                    </TableCell>
                    <TableCell>{row.currentDept}</TableCell>
                    <TableCell>{fmtDur(row.currentWait)}</TableCell>
                    <TableCell className="font-semibold text-primary">{fmtDur(row.simulatedWait)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.downstreamStages.length > 0 ? (
                        <span className="flex items-center gap-1">
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          Delays {row.downstreamStages.join(", ")}
                        </span>
                      ) : (
                        "Final stage"
                      )}
                    </TableCell>
                    <TableCell>
                      {row.willBeOverdue ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          High Risk (Overdue)
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Absorbed by Target
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
