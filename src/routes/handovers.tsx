import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Search, ArrowRight, ArrowLeftRight, CheckCircle2, AlertCircle, Edit3, LayoutGrid, Table as TableIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HandoverNote } from "@/components/flow/HandoverNote";
import { Empty, PageHeader, Pill, fmtTime } from "@/components/flow/ui";
import { deptName } from "@/lib/workflow/engine";
import { useFlow } from "@/lib/workflow/store";
import { meta } from "@/lib/meta";

export const Route = createFileRoute("/handovers")({
  head: () => meta("Handover History", "Audit table of automatic department handovers with search and department filtering."),
  component: Handovers,
});

function Handovers() {
  const s = useFlow();
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const query = q.trim().toLowerCase();

  const list = useMemo(() => {
    return s.handovers
      .filter((h) => {
        const matchesQuery =
          !query ||
          h.patientId.toLowerCase().includes(query) ||
          h.completedTaskTitle.toLowerCase().includes(query) ||
          (h.newTaskTitle && h.newTaskTitle.toLowerCase().includes(query));

        const matchesDept =
          deptFilter === "all" ||
          h.fromDept === deptFilter ||
          h.toDept === deptFilter;

        return matchesQuery && matchesDept;
      })
      .sort((a, b) => b.completedAt - a.completedAt); // Newest first
  }, [s.handovers, query, deptFilter]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Handover History"
        desc="Permanent audit trail: automatic department handovers, instructions, timestamps and supervisor corrections."
        actions={
          <div className="flex rounded-lg border bg-card p-0.5">
            <Button
              size="sm"
              variant={viewMode === "table" ? "default" : "ghost"}
              onClick={() => setViewMode("table")}
              className="h-7 text-xs"
            >
              <TableIcon className="h-3.5 w-3.5 mr-1" />
              Table
            </Button>
            <Button
              size="sm"
              variant={viewMode === "cards" ? "default" : "ghost"}
              onClick={() => setViewMode("cards")}
              className="h-7 text-xs"
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-1" />
              Cards
            </Button>
          </div>
        }
      />

      {/* Filter controls */}
      <div className="card-surface flex flex-wrap items-center gap-3 p-3.5 rounded-xl border">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by patient ID (e.g. P-1042)…"
            className="pl-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Department:</span>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-52 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {s.departments.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-xs">
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto text-xs text-muted-foreground">
          Showing <strong>{list.length}</strong> handover record{list.length !== 1 ? "s" : ""} (newest first)
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="card-surface overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient ID</TableHead>
                <TableHead>Transition Path</TableHead>
                <TableHead>Completed Stage / Task</TableHead>
                <TableHead>Staff Member</TableHead>
                <TableHead>Completed Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Instructions & Notes</TableHead>
                <TableHead>Audit Corrections</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Empty>No handover records match your search criteria.</Empty>
                  </TableCell>
                </TableRow>
              ) : (
                list.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono font-bold text-foreground">{h.patientId}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <span>{deptName(s, h.fromDept)}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className={h.toDept ? "text-primary" : "text-success"}>
                          {h.toDept ? deptName(s, h.toDept) : "Workflow Closed"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium text-foreground">{h.completedTaskTitle}</div>
                      {h.newTaskTitle && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Next: {h.newTaskTitle}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{h.completedBy}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtTime(h.completedAt)}
                    </TableCell>
                    <TableCell>
                      {h.status === "success" ? (
                        <Pill tone="green">Handed over</Pill>
                      ) : h.status === "workflow_completed" ? (
                        <Pill tone="pink">Workflow completed</Pill>
                      ) : (
                        <Pill tone="red">Failed</Pill>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs text-xs text-muted-foreground">
                      <span className="line-clamp-2">{h.instructions || "Standard clinical transition."}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {h.corrections.length > 0 ? (
                        <div className="space-y-1">
                          {h.corrections.map((c, i) => (
                            <div key={i} className="rounded bg-muted/60 p-1 text-[11px]">
                              <strong>{c.by}:</strong> {c.text}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">None</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.length ? (
            list.map((h) => <HandoverNote key={h.id} h={h} />)
          ) : (
            <div className="col-span-full">
              <Empty>No handovers found matching filter.</Empty>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
