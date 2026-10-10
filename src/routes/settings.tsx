import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, Pill, Section } from "@/components/flow/ui";
import { canEditSettings, validateConfig } from "@/lib/workflow/engine";
import { useFlow } from "@/lib/workflow/store";
import type { Department, DeptId, WorkflowConfig } from "@/lib/workflow/types";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/settings")({
  head: () => meta("Workflow Settings", "Configure workflow steps, transitions, thresholds and escalation rules."),
  component: Settings,
});

function Settings() {
  const s = useFlow();
  const [config, setConfig] = useState<WorkflowConfig>(s.config);
  const [depts, setDepts] = useState<Department[]>(s.departments);
  useEffect(() => { setConfig(s.config); setDepts(s.departments); }, [s.config, s.departments]);
  const editable = canEditSettings(s.user);
  const errors = validateConfig(config, depts);
  const step = (id: DeptId, patch: Partial<WorkflowConfig["steps"][number]>) => setConfig({ ...config, steps: config.steps.map((x) => (x.deptId === id ? { ...x, ...patch } : x)) });
  const dept = (id: DeptId, patch: Partial<Department>) => setDepts(depts.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-6">
      <PageHeader title="Workflow Settings" desc="This sequence is an example; clinical workflows must be approved by authorised clinic personnel."
        actions={editable ? <Button disabled={errors.length > 0} onClick={() => { const r = s.saveSettings(config, depts); r.ok ? toast.success(r.message) : toast.error(r.message); }}>Save changes</Button> : <Pill tone="amber">Read-only — switch to the Admin demo user to edit</Pill>} />
      {errors.length > 0 && <div className="rounded-xl bg-danger-soft p-3 text-sm text-destructive">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
      <Section title="Workflow steps & transitions">
        <div className="space-y-3">
          {config.steps.map((st) => {
            const d = depts.find((x) => x.id === st.deptId)!;
            return (
              <div key={st.deptId} className="grid gap-3 rounded-xl border p-4 md:grid-cols-12 md:items-center">
                <div className="font-semibold md:col-span-2">{d.name}</div>
                <Input className="md:col-span-3" disabled={!editable} value={st.taskTitle} onChange={(e) => step(st.deptId, { taskTitle: e.target.value })} aria-label="Task title" />
                <div className="md:col-span-3">
                  <Select disabled={!editable} value={st.next ?? "end"} onValueChange={(v) => step(st.deptId, { next: v === "end" ? null : (v as DeptId) })}>
                    <SelectTrigger aria-label="Next department"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="end">End of workflow</SelectItem>{depts.filter((x) => x.id !== st.deptId).map((x) => <SelectItem key={x.id} value={x.id}>→ {x.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-xs md:col-span-2"><Switch disabled={!editable || !st.next} checked={st.enabled} onCheckedChange={(v) => step(st.deptId, { enabled: v })} />Transition enabled</label>
                <Input className="md:col-span-12" disabled={!editable} value={st.instructions} onChange={(e) => step(st.deptId, { instructions: e.target.value })} placeholder="Authorised handover instructions" aria-label="Instructions" />
              </div>
            );
          })}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm"><Switch disabled={!editable} checked={config.allowCompletionAtEnd} onCheckedChange={(v) => setConfig({ ...config, allowCompletionAtEnd: v })} />Allow workflow completion after the final step</label>
      </Section>
      <Section title="Waiting-time thresholds & escalation">
        <label className="mb-4 flex items-center gap-2 text-sm"><Switch disabled={!editable} checked={config.escalationEnabled} onCheckedChange={(v) => setConfig({ ...config, escalationEnabled: v })} />Escalate prolonged delays to the supervisor (in-app alert)</label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {depts.map((d) => (
            <div key={d.id} className="rounded-xl border p-4">
              <div className="mb-2 font-semibold">{d.name}</div>
              <label className="text-xs text-muted-foreground">Overdue after (minutes)</label>
              <Input type="number" min={1} disabled={!editable} value={d.thresholdMinutes} onChange={(e) => dept(d.id, { thresholdMinutes: Number(e.target.value) })} />
              <label className="mt-2 block text-xs text-muted-foreground">Escalate after a further (minutes)</label>
              <Input type="number" min={0} disabled={!editable} value={d.escalationMinutes} onChange={(e) => dept(d.id, { escalationMinutes: Number(e.target.value) })} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
