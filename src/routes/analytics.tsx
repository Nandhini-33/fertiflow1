import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, fmtDur, MetricCard, PageHeader, Pill, Section } from "@/components/flow/ui";
import { deptName, isOverdue, stageOrder, waitingMs } from "@/lib/workflow/engine";
import { useFlow, useNow } from "@/lib/workflow/store";
import { CheckCircle2, AlertTriangle, Inbox, Percent, XCircle } from "lucide-react";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/analytics")({
  head: () => meta("Analytics", "Handover success rate, waiting times and department workload computed from workflow records."),
  component: Analytics,
});

const DAY = 86_400_000;
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--primary)"];

function Analytics() {
  const s = useFlow();
  const now = useNow();
  const [range, setRange] = useState("7");
  const [dept, setDept] = useState("all");
  const since = now - Number(range) * DAY;
  const tasks = s.tasks.filter((t) => t.createdAt >= since && (dept === "all" || t.deptId === dept));
  const hand = s.handovers.filter((h) => h.completedAt >= since && (dept === "all" || h.fromDept === dept));
  const done = tasks.filter((t) => t.status === "completed");
  const pending = tasks.filter((t) => t.status !== "completed");
  const ok = hand.filter((h) => h.status !== "failed").length;
  const rate = hand.length ? Math.round((ok / hand.length) * 100) : null;
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const order = stageOrder(s.config).filter((d) => dept === "all" || d === dept);
  const rows = order.map((d) => {
    const t = tasks.filter((x) => x.deptId === d);
    return { d, name: deptName(s, d), wait: avg(t.map((x) => waitingMs(x, now))), done: avg(t.filter((x) => x.completedAt).map((x) => x.completedAt! - (x.startedAt ?? x.createdAt))), open: t.filter((x) => x.status !== "completed").length, total: t.length };
  });
  const days = Math.min(Number(range), 14);
  const trend = Array.from({ length: days }, (_, i) => {
    const start = new Date(now - (days - 1 - i) * DAY).setHours(0, 0, 0, 0);
    return { day: new Date(start).toLocaleDateString("en", { day: "numeric", month: "short" }), Completed: done.filter((t) => t.completedAt! >= start && t.completedAt! < start + DAY).length };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" desc="All figures are computed from the workflow records below."
        actions={<>
          <Pill tone="amber">Includes sample demo data</Pill>
          <Select value={range} onValueChange={setRange}><SelectTrigger className="w-36" aria-label="Range"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Last 24 hours</SelectItem><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem></SelectContent></Select>
          <Select value={dept} onValueChange={setDept}><SelectTrigger className="w-44" aria-label="Department"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All departments</SelectItem>{s.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
        </>} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <MetricCard label="Tasks completed" value={done.length} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" />
        <MetricCard label="Pending" value={pending.length} icon={<Inbox className="h-4 w-4" />} tone="amber" />
        <MetricCard label="Overdue" value={pending.filter((t) => isOverdue(s, t, now)).length} icon={<AlertTriangle className="h-4 w-4" />} tone="red" />
        <MetricCard label="Handover success" value={rate === null ? "—" : `${rate}%`} icon={<Percent className="h-4 w-4" />} hint={`${hand.length} handovers`} />
        <MetricCard label="Failed handovers" value={hand.length - ok} icon={<XCircle className="h-4 w-4" />} tone="red" />
      </div>
      {tasks.length === 0 ? <Empty>No records in this period.</Empty> : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Average waiting time by department"><div className="h-64"><ResponsiveContainer><BarChart data={rows.map((r) => ({ name: r.name.split(" ")[0], minutes: Math.round(r.wait / 60000) }))}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} unit="m" /><Tooltip /><Bar dataKey="minutes" fill="var(--chart-1)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Section>
            <Section title="Workload distribution"><div className="h-64"><ResponsiveContainer><PieChart><Pie data={rows.filter((r) => r.total)} dataKey="total" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>{rows.map((r, i) => <Cell key={r.d} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></Section>
          </div>
          <Section title="Completion trend"><div className="h-56"><ResponsiveContainer><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="day" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Line dataKey="Completed" stroke="var(--chart-1)" strokeWidth={2.5} /></LineChart></ResponsiveContainer></div></Section>
          <Section title="Department breakdown">
            <Table><TableHeader><TableRow><TableHead>Department</TableHead><TableHead>Tasks</TableHead><TableHead>Open</TableHead><TableHead>Avg waiting</TableHead><TableHead>Avg completion time</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map((r) => <TableRow key={r.d}><TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.total}</TableCell><TableCell>{r.open}</TableCell><TableCell>{fmtDur(r.wait)}</TableCell><TableCell>{r.done ? fmtDur(r.done) : "—"}</TableCell></TableRow>)}</TableBody></Table>
          </Section>
        </>
      )}
    </div>
  );
}
