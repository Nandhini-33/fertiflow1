import { describe, expect, it } from "vitest";
import { buildSeed, DEMO_USERS } from "@/lib/workflow/seed";
import {
  completeTask,
  isOverdue,
  isNearTarget,
  isUserInDept,
  canActOnTask,
  generateNextPatientId,
  startTask,
} from "@/lib/workflow/engine";
import { processAssistantQuery } from "@/lib/ai/assistant";
import type { Patient, TreatmentType } from "@/lib/workflow/types";

describe("FertiFlow Complete System Integration & Verification", () => {
  const now = Date.now();
  const seed = buildSeed(now);

  const admin = DEMO_USERS.find((u) => u.role === "admin")!;
  const doctor = DEMO_USERS.find((u) => u.role === "doctor")!;
  const nurse = DEMO_USERS.find((u) => u.role === "nurse")!;
  const lab = DEMO_USERS.find((u) => u.role === "lab")!;
  const embryology = DEMO_USERS.find((u) => u.role === "embryology")!;

  it("1. Sample Data Check: Has 11 patients, exactly 2 overdue, 2 close to target, and 1 completed", () => {
    expect(seed.patients).toHaveLength(11);

    const openTasks = seed.tasks.filter((t) => t.status !== "completed");
    const overdueTasks = openTasks.filter((t) => isOverdue(seed, t, now));
    const nearTargetTasks = openTasks.filter((t) => isNearTarget(seed, t, now));

    // Overdue tasks should be 2 (P-1042 in Laboratory, P-1046 in Embryology)
    expect(overdueTasks).toHaveLength(2);
    expect(overdueTasks.map((t) => t.patientId).sort()).toEqual(["P-1042", "P-1046"]);

    // Near target tasks should be 2 (P-1041 in Consultation, P-1044 in Sample Collection)
    expect(nearTargetTasks).toHaveLength(2);
    expect(nearTargetTasks.map((t) => t.patientId).sort()).toEqual(["P-1041", "P-1044"]);

    // Finished patient
    const finishedPatient = seed.patients.find((p) => p.id === "P-1050")!;
    expect(finishedPatient).toBeDefined();
    expect(finishedPatient.status).toBe("completed");
  });

  it("2. Roles & Permissions Check: 5 demo users have correct departmental access", () => {
    expect(DEMO_USERS).toHaveLength(5);

    // Doctor can act on Consultation and Procedure, but not Laboratory
    expect(isUserInDept(doctor, "consultation")).toBe(true);
    expect(isUserInDept(doctor, "procedures")).toBe(true);
    expect(isUserInDept(doctor, "laboratory")).toBe(false);

    // Nurse can act on Sample and Follow-up
    expect(isUserInDept(nurse, "sample")).toBe(true);
    expect(isUserInDept(nurse, "followup")).toBe(true);
    expect(isUserInDept(nurse, "embryology")).toBe(false);

    // Lab can act on Laboratory only
    expect(isUserInDept(lab, "laboratory")).toBe(true);
    expect(isUserInDept(lab, "consultation")).toBe(false);

    // Embryology can act on Embryology only
    expect(isUserInDept(embryology, "embryology")).toBe(true);
    expect(isUserInDept(embryology, "procedures")).toBe(false);

    // Admin can act on everything
    expect(isUserInDept(admin, "consultation")).toBe(true);
    expect(isUserInDept(admin, "laboratory")).toBe(true);
    expect(isUserInDept(admin, "embryology")).toBe(true);
  });

  it("3. Embryology Handover Flow: Embryology marks done -> Doctors instantly receive Procedure task", () => {
    let state = buildSeed(now);

    // Find active Embryology task (P-1047 in Embryology)
    const embTask = state.tasks.find((t) => t.patientId === "P-1047" && t.status !== "completed")!;
    expect(embTask.deptId).toBe("embryology");

    // Embryology user completes the task
    const r = completeTask(state, embTask.id, embryology, now);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect(r.message).toContain("P-1047");
    state = r.state;

    // The Embryology task is completed
    const completedEmbTask = state.tasks.find((t) => t.id === embTask.id)!;
    expect(completedEmbTask.status).toBe("completed");

    // The Procedure task is automatically created for Doctors
    const procTask = state.tasks.find((t) => t.patientId === "P-1047" && t.status === "incoming")!;
    expect(procTask).toBeDefined();
    expect(procTask.deptId).toBe("procedures");

    // Doctor can act on this new task
    expect(canActOnTask(doctor, procTask)).toBe(true);

    // Patient's current department is updated to procedures
    const patientP1047 = state.patients.find((p) => p.id === "P-1047")!;
    expect(patientP1047.currentDept).toBe("procedures");

    // Automatic handover note created
    const latestHandover = state.handovers[0]!;
    expect(latestHandover.patientId).toBe("P-1047");
    expect(latestHandover.fromDept).toBe("embryology");
    expect(latestHandover.toDept).toBe("procedures");
    expect(latestHandover.status).toBe("success");

    // Notification created
    const notif = state.notifications.find((n) => n.patientId === "P-1047" && n.deptId === "procedures")!;
    expect(notif).toBeDefined();
  });

  it("4. Admin Add Patient: Generates ID, Consultation task created for Doctors, Notification sent", () => {
    const state = buildSeed(now);
    const nextId = generateNextPatientId(state.patients);
    expect(nextId).toBe("P-1051");

    // Simulate adding patient
    const newPatient: Patient = {
      id: nextId,
      label: "Anjali Nair",
      name: "Anjali Nair",
      age: 33,
      treatment: "IVF",
      note: "Priority consultation referral",
      priority: "normal",
      currentDept: "consultation",
      status: "active",
      createdAt: now,
    };

    expect(newPatient.age).toBeGreaterThanOrEqual(18);
    expect(newPatient.age).toBeLessThanOrEqual(60);
    expect(["IVF", "ICSI", "IUI", "Egg freezing"]).toContain(newPatient.treatment);
  });

  it("5. AI Voice Assistant Query Processor: Answers from real app data and generates confirmation card", () => {
    const state = buildSeed(now);

    // Overdue query
    const overdueRes = processAssistantQuery("How many tasks are overdue?", state, admin, "en-IN", now);
    expect(overdueRes.text).toContain("2 tasks are overdue");
    expect(overdueRes.text).toContain("P-1042 in Laboratory");

    // Critical now query
    const critRes = processAssistantQuery("What is critical now?", state, admin, "en-IN", now);
    expect(critRes.text).toContain("Critical now");
    expect(critRes.text).toContain("WHAT");
    expect(critRes.text).toContain("WHERE");
    expect(critRes.text).toContain("WHEN");

    // Lab pending query
    const labRes = processAssistantQuery("What is pending for the Lab?", state, admin, "en-IN", now);
    expect(labRes.text).toContain("Laboratory");
    expect(labRes.text).toContain("P-1042");

    // Handover summary for P-1042
    const summaryRes = processAssistantQuery("Prepare a handover summary for P-1042", state, admin, "en-IN", now);
    expect(summaryRes.text).toContain("Handover Summary for P-1042");
    expect(summaryRes.text).toContain("Pooja Hegde");
    expect(summaryRes.text).toContain("Laboratory");

    // Quick update with Confirmation Card
    const updateRes = processAssistantQuery("P-1046 embryology done, 8 blastocysts grade AA", state, embryology, "en-IN", now);
    expect(updateRes.proposedAction).toBeDefined();
    expect(updateRes.proposedAction?.patientId).toBe("P-1046");
    expect(updateRes.proposedAction?.deptName).toBe("Embryology");
    expect(updateRes.proposedAction?.note).toContain("8 blastocysts grade AA");
  });
});
