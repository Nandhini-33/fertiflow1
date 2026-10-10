import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Trash2, Edit3, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFlow } from "@/lib/workflow/store";
import type { Patient, Priority, TreatmentType } from "@/lib/workflow/types";

interface EditPatientDialogProps {
  patient: Patient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

const TREATMENTS: TreatmentType[] = ["IVF", "ICSI", "IUI", "Egg freezing"];

export function EditPatientDialog({ patient, open, onOpenChange, onDeleted }: EditPatientDialogProps) {
  const { user, updatePatient, deletePatient } = useFlow();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [treatment, setTreatment] = useState<string>("IVF");
  const [priority, setPriority] = useState<Priority>("normal");
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (patient) {
      setName(patient.label || patient.name || "");
      setAge(patient.age ? String(patient.age) : "30");
      setTreatment(patient.treatment || "IVF");
      setPriority(patient.priority || "normal");
      setNote(patient.note || "");
    }
  }, [patient]);

  if (!patient || user.role !== "admin") return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Patient name cannot be empty.");
      return;
    }
    const numAge = parseInt(age, 10);
    if (isNaN(numAge) || numAge < 18 || numAge > 60) {
      toast.error("Age must be between 18 and 60.");
      return;
    }

    const res = updatePatient(patient.id, {
      label: name.trim(),
      name: name.trim(),
      age: numAge,
      treatment,
      priority,
      note: note.trim(),
    });

    if (res.ok) {
      toast.success(res.message);
      onOpenChange(false);
    } else {
      toast.error(res.message);
    }
  };

  const handleDelete = () => {
    const res = deletePatient(patient.id);
    if (res.ok) {
      toast.success(res.message);
      setConfirmDelete(false);
      onOpenChange(false);
      onDeleted?.();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-primary" />
              Edit Patient {patient.id}
            </DialogTitle>
            <DialogDescription>Admin modification of clinical record attributes.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label>Patient Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Age (18-60)</Label>
                <Input type="number" min={18} max={60} value={age} onChange={(e) => setAge(e.target.value)} required />
              </div>
              <div>
                <Label>Treatment</Label>
                <Select value={treatment} onValueChange={setTreatment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TREATMENTS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v: Priority) => setPriority(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete Patient
              </Button>

              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">Save Changes</Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Patient Deletion
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete patient <strong>{patient.id} ({patient.label})</strong>?
              This will remove all associated active tasks and records from the clinic workflow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>
              Yes, Delete Patient
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
