import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Loader2, Play } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { canActOnTask, canReassign, deptName, exceededMs, getDept, isOverdue, waitingMs } from "@/lib/workflow/engine";
import { useFlow, useNow } from "@/lib/workflow/store";
import { fmtDur, fmtTime, PriorityBadge, StatusBadge } from "./ui";

export function TaskDialog({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const s = useFlow();
  const now = useNow(15_000);
  const task = s.tasks.find((t) => t.id === taskId);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  if (!task) return null;
  const dept = getDept(s, task.deptId);
  const step = s.config.steps.find((x) => x.deptId === task.deptId);
  const allowed = canActOnTask(s.user, task);
  const history = s.activity.filter((a) => a.patientId === task.patientId).slice(0, 6);
  const overdue = isOverdue(s, task, now);

  const report = (r: { ok: boolean; message: string }) => (r.ok ? toast.success(r.message) : toast.error(r.message));

  const doComplete = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 450)); // processing state; the operation itself is atomic
      report(s.complete(task.id));
    } catch {
      toast.error("Handover failed unexpectedly. The workflow was not advanced.");
    } finally {
      setBusy(false);
      setConfirm(false);
      lock.current = false;
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 font-display text-2xl">
            <span className="font-mono">{task.patientId}</span> · {task.title}
          </DialogTitle>
          <DialogDescription>{dept.name} · created {fmtTime(task.createdAt)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <StatusBadge task={task} state={s} now={now} />
          <PriorityBadge p={task.priority} />
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted p-4 text-sm sm:grid-cols-3">
          <Info k="Assigned to" v={task.assignee} />
          <Info k="Waiting" v={fmtDur(waitingMs(task, now))} />
          <Info k="Threshold" v={`${dept.thresholdMinutes} min`} />
          {overdue && <Info k="Exceeded by" v={<span className="text-destructive">{fmtDur(exceededMs(s, task, now))}</span>} />}
          <Info k="From" v={deptName(s, task.prevDept)} />
          <Info k="Next step" v={deptName(s, step?.next)} />
          {task.completedAt && <Info k="Completed" v={`${fmtTime(task.completedAt)} by ${task.completedBy}`} />}
        </div>
        {overdue && (
          <p className="rounded-lg bg-danger-soft p-3 text-xs text-destructive">
            Recommended action: review the {dept.name} queue or contact the assigned staff member.
          </p>
        )}

        <div>
          <h4 className="mb-1 text-sm font-semibold">Handover instructions</h4>
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">{task.instructions || "None"}</p>
        </div>

        {canReassign(s.user) && task.status !== "completed" && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Reassign</span>
            <Select value={task.assignee} onValueChange={(v) => report(s.reassign(task.id, v))}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{dept.staff.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        <div>
          <h4 className="mb-2 text-sm font-semibold">Work notes</h4>
          <ul className="mb-2 space-y-1.5">
            {task.notes.length === 0 && <li className="text-xs text-muted-foreground">No notes yet.</li>}
            {task.notes.map((n, i) => (
              <li key={i} className="rounded-lg bg-muted px-3 py-2 text-sm"><span className="font-semibold">{n.by}</span> <span className="text-xs text-muted-foreground">{fmtTime(n.at)}</span><div>{n.text}</div></li>
            ))}
          </ul>
          {(allowed || canReassign(s.user)) && (
            <div className="flex gap-2">
              <Textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Add an administrative work note…" className="min-h-[44px]" />
              <Button variant="outline" onClick={() => { const r = s.note(task.id, note); report(r); if (r.ok) setNote(""); }}>Add</Button>
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold">Recent workflow activity</h4>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {history.map((a) => <li key={a.id}><span className="text-foreground">{fmtTime(a.at)}</span> — {a.message}</li>)}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <Button variant="ghost" asChild>
            <Link to="/patients/$patientId" params={{ patientId: task.patientId }} onClick={onClose}>Open workflow <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          {task.status !== "completed" && (
            allowed ? (
              <div className="flex gap-2">
                {task.status === "incoming" && <Button variant="outline" onClick={() => report(s.start(task.id))}><Play className="h-4 w-4" />Start task</Button>}
                <Button onClick={() => setConfirm(true)} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Complete Task
                </Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Your demo role can't act on {dept.name} tasks.</span>
            )
          )}
        </div>
      </DialogContent>

      <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {step?.next
                ? `${task.patientId} will be handed over automatically to ${deptName(s, step.next)}. A new task, handover note and notification will be created.`
                : `This is the final step. ${task.patientId}'s workflow will be marked as completed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); doComplete(); }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}Confirm completion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><div className="text-[11px] text-muted-foreground">{k}</div><div className="font-medium">{v}</div></div>;
}
