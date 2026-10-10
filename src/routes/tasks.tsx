import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TaskDialog } from "@/components/flow/TaskDialog";
import { HandoverNote } from "@/components/flow/HandoverNote";
import { Empty, fmtDur, fmtTime, PageHeader, PriorityBadge, StatusBadge } from "@/components/flow/ui";
import { deptName, isOverdue, waitingMs } from "@/lib/workflow/engine";
import { useFlow, useNow } from "@/lib/workflow/store";
import { useTaskFilters } from "./board";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/tasks")({
  head: () => meta("Tasks", "Manage, filter and reassign clinic workflow tasks, including failed handovers."),
  component: Tasks,
});

function Tasks() {
  const s = useFlow();
  const now = useNow();
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [staff, setStaff] = useState("");
  const [date, setDate] = useState("");
  const base = s.tasks.filter((t) =>
    (tab === "all" || (tab === "overdue" ? isOverdue(s, t, now) : t.status === tab)) &&
    (!staff || t.assignee.toLowerCase().includes(staff.toLowerCase())) &&
    (!date || new Date(t.createdAt).toISOString().slice(0, 10) === date));
  const { filtered, controls } = useTaskFilters(base, now);
  const failed = s.handovers.filter((h) => h.status === "failed");
  return (
    <div className="space-y-5">
      <PageHeader title="Tasks" desc="Every task across departments. Completed history is read-only." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="incoming">Incoming</TabsTrigger>
          <TabsTrigger value="in_progress">In progress</TabsTrigger><TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger><TabsTrigger value="failed">Failed handovers ({failed.length})</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "failed" ? (
        <div className="grid gap-4 md:grid-cols-2">{failed.length ? failed.map((h) => <HandoverNote key={h.id} h={h} />) : <Empty>No failed handovers. Failures appear here when a transition is disabled or a department has no staff.</Empty>}</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">{controls}
            <div className="card-surface flex gap-2 p-3">
              <Input placeholder="Assigned staff…" value={staff} onChange={(e) => setStaff(e.target.value)} className="w-40" />
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" aria-label="Created date" />
            </div>
          </div>
          <div className="card-surface overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Task</TableHead><TableHead>Department</TableHead><TableHead>Staff</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Created</TableHead><TableHead>Waiting</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono font-semibold">{t.patientId}</TableCell><TableCell>{t.title}</TableCell>
                    <TableCell>{deptName(s, t.deptId)}</TableCell><TableCell>{t.assignee}</TableCell>
                    <TableCell><StatusBadge task={t} state={s} now={now} /></TableCell><TableCell><PriorityBadge p={t.priority} /></TableCell>
                    <TableCell>{fmtTime(t.createdAt)}</TableCell><TableCell>{fmtDur(waitingMs(t, now))}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => setOpen(t.id)}>Open</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!filtered.length && <div className="p-4"><Empty>No tasks match.</Empty></div>}
          </div>
        </>
      )}
      <TaskDialog taskId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
