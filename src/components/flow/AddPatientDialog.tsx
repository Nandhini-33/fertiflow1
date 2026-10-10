import { useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Upload, UserPlus, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFlow } from "@/lib/workflow/store";
import type { TreatmentType } from "@/lib/workflow/types";

const TREATMENTS: TreatmentType[] = ["IVF", "ICSI", "IUI", "Egg freezing"];

interface AddPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormErrors {
  name?: string;
  age?: string;
  treatment?: string;
}

export function AddPatientDialog({ open, onOpenChange }: AddPatientDialogProps) {
  const { user, addPatient } = useFlow();

  // Single patient form state
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [treatment, setTreatment] = useState<TreatmentType | "">("IVF");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  // CSV Import state
  const [csvText, setCsvText] = useState("");
  const [importResults, setImportResults] = useState<{
    total: number;
    success: number;
    failures: Array<{ row: number; error: string; data: string }>;
  } | null>(null);

  if (user.role !== "admin") {
    return null;
  }

  const validate = () => {
    const errs: FormErrors = {};
    if (!name.trim()) {
      errs.name = "Patient name is required.";
    } else if (name.trim().length < 2) {
      errs.name = "Patient name must be at least 2 characters.";
    }

    const numAge = parseInt(age, 10);
    if (!age || isNaN(numAge)) {
      errs.age = "Age is required.";
    } else if (numAge < 18 || numAge > 60) {
      errs.age = "Age must be between 18 and 60 years.";
    }

    if (!treatment) {
      errs.treatment = "Treatment type is required.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const res = addPatient({
      name: name.trim(),
      age: parseInt(age, 10),
      treatment: treatment as TreatmentType,
      note: note.trim(),
    });

    if (res.ok) {
      toast.success(res.message);
      // Reset form
      setName("");
      setAge("");
      setTreatment("IVF");
      setNote("");
      setErrors({});
      onOpenChange(false);
    } else {
      toast.error(res.message);
    }
  };

  const handleDownloadSampleCsv = () => {
    const csvContent =
      "name,age,treatment,note\n" +
      "Sneha Patel,32,IVF,Priority cycle assessment\n" +
      "Aarav Sharma,29,ICSI,Partner report attached\n" +
      "Meera Sen,35,Egg freezing,Cryopreservation protocol\n" +
      "Kavya Nair,31,IUI,Baseline scan booked";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "fertiflow_patient_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.info("Sample CSV template downloaded.");
  };

  const handleProcessCsv = () => {
    if (!csvText.trim()) {
      toast.error("Please paste or upload CSV content.");
      return;
    }

    const lines = csvText.trim().split("\n");
    if (lines.length <= 1) {
      toast.error("CSV has no data rows.");
      return;
    }

    // Skip header line if present
    const startIndex = lines[0]?.toLowerCase().includes("name") ? 1 : 0;
    const failures: Array<{ row: number; error: string; data: string }> = [];
    const validRows: Array<{ name: string; age: number; treatment: TreatmentType; note?: string }> = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;
      const parts = line.split(",").map((p) => p.trim());
      const rowNum = i + 1;

      if (parts.length < 3) {
        failures.push({ row: rowNum, error: "Missing columns (needs name, age, treatment)", data: line });
        continue;
      }

      const rowName = parts[0] || "";
      const rowAge = parseInt(parts[1] || "", 10);
      const rowTreatment = (parts[2] || "") as TreatmentType;
      const rowNote = parts.slice(3).join(",") || "";

      if (!rowName) {
        failures.push({ row: rowNum, error: "Patient name is required", data: line });
        continue;
      }

      if (isNaN(rowAge) || rowAge < 18 || rowAge > 60) {
        failures.push({ row: rowNum, error: `Age ${parts[1]} must be between 18 and 60`, data: line });
        continue;
      }

      if (!TREATMENTS.includes(rowTreatment)) {
        failures.push({
          row: rowNum,
          error: `Invalid treatment '${parts[2]}' (must be IVF, ICSI, IUI, or Egg freezing)`,
          data: line,
        });
        continue;
      }

      validRows.push({ name: rowName, age: rowAge, treatment: rowTreatment, note: rowNote });
    }

    let successCount = 0;
    for (const r of validRows) {
      const res = addPatient(r);
      if (res.ok) successCount++;
    }

    setImportResults({
      total: lines.length - startIndex,
      success: successCount,
      failures,
    });

    if (successCount > 0) {
      toast.success(`Successfully imported ${successCount} patient(s) into Consultation.`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-display">
            <UserPlus className="h-5 w-5 text-primary" />
            Admit New Patient
          </DialogTitle>
          <DialogDescription>
            Admin function: register a new patient and automatically dispatch the initial Consultation task to Doctors.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-primary/20 bg-accent/40 p-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Notice: </span>
          Demo mode: use fictional data only. Do not enter real patient data.
        </div>

        <Tabs defaultValue="manual" className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            <TabsTrigger value="csv">Import from CSV</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 pt-3">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="pt-name">Patient Name *</Label>
                <Input
                  id="pt-name"
                  placeholder="e.g. Kavya Natarajan"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors({ ...errors, name: "" });
                  }}
                  className={errors.name ? "border-destructive" : ""}
                />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pt-age">Age (18 to 60) *</Label>
                  <Input
                    id="pt-age"
                    type="number"
                    min={18}
                    max={60}
                    placeholder="e.g. 32"
                    value={age}
                    onChange={(e) => {
                      setAge(e.target.value);
                      if (errors.age) setErrors({ ...errors, age: "" });
                    }}
                    className={errors.age ? "border-destructive" : ""}
                  />
                  {errors.age && <p className="mt-1 text-xs text-destructive">{errors.age}</p>}
                </div>

                <div>
                  <Label htmlFor="pt-treatment">Treatment Type *</Label>
                  <Select
                    value={treatment}
                    onValueChange={(val: TreatmentType) => {
                      setTreatment(val);
                      if (errors.treatment) setErrors({ ...errors, treatment: "" });
                    }}
                  >
                    <SelectTrigger id="pt-treatment">
                      <SelectValue placeholder="Select treatment" />
                    </SelectTrigger>
                    <SelectContent>
                      {TREATMENTS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.treatment && <p className="mt-1 text-xs text-destructive">{errors.treatment}</p>}
                </div>
              </div>

              <div>
                <Label htmlFor="pt-note">Administrative / Referral Note (Optional)</Label>
                <Textarea
                  id="pt-note"
                  placeholder="e.g. Referred from external clinic; hormone blood reports attached."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-[70px]"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Save & Send to Doctors
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="csv" className="space-y-4 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Download template or paste comma-separated values:</span>
              <Button type="button" size="sm" variant="outline" onClick={handleDownloadSampleCsv}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Template CSV
              </Button>
            </div>

            <Textarea
              placeholder={"name,age,treatment,note\nSneha Patel,32,IVF,Priority cycle\nAarav Sharma,29,ICSI,Partner report attached"}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="font-mono text-xs min-h-[140px]"
            />

            <Button type="button" onClick={handleProcessCsv} className="w-full">
              <Upload className="h-4 w-4 mr-1.5" />
              Verify & Import Patients
            </Button>

            {importResults && (
              <div className="space-y-2 rounded-xl border p-3 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="font-semibold">Successfully imported: {importResults.success} patient(s)</span>
                </div>

                {importResults.failures.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Failed Rows ({importResults.failures.length}):
                    </div>
                    <ul className="space-y-1">
                      {importResults.failures.map((f, i) => (
                        <li key={i} className="rounded bg-destructive/10 p-1.5 text-[11px] text-destructive">
                          <span className="font-semibold">Row {f.row}: </span>
                          {f.error} — <code className="text-muted-foreground">{f.data}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
