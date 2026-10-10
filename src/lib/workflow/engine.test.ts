import { describe, expect, it } from "vitest";
import { buildSeed, DEMO_USERS } from "./seed";
import { completeTask, evaluateDelays, isOverdue, MIN, validateConfig } from "./engine";

const admin = DEMO_USERS[0]!;
const now = Date.now();

function p1043Task(s = buildSeed(now)) {
  return s.tasks.find((t) => t.patientId === "P-1043" && t.status !== "completed")!;
}

describe("automatic handover engine", () => {
  it("P-1043 starts with an active Sample Collection task", () => {
    expect(p1043Task().deptId).toBe("sample");
  });

  it("completing Sample Collection creates a Laboratory task, note and notification", () => {
    const s = buildSeed(now);
    const r = completeTask(s, p1043Task(s).id, admin, now);
    expect(r.ok).toBe(true);
    const st = r.state;
    expect(st.tasks.find((t) => t.id === p1043Task(s).id)!.status).toBe("completed");
    const lab = st.tasks.find((t) => t.patientId === "P-1043" && t.deptId === "laboratory");
    expect(lab?.status).toBe("incoming");
    expect(st.patients.find((p) => p.id === "P-1043")!.currentDept).toBe("laboratory");
    expect(st.handovers[0]).toMatchObject({ patientId: "P-1043", fromDept: "sample", toDept: "laboratory", status: "success" });
    expect(st.notifications.some((n) => n.patientId === "P-1043" && n.deptId === "laboratory" && n.type === "assignment")).toBe(true);
  });

  it("completing twice does not create a duplicate task", () => {
    const s = buildSeed(now);
    const id = p1043Task(s).id;
    const r1 = completeTask(s, id, admin, now);
    const r2 = completeTask(r1.state, id, admin, now + 1);
    expect(r2.ok).toBe(false);
    expect(r2.state.tasks.filter((t) => t.patientId === "P-1043" && t.deptId === "laboratory")).toHaveLength(1);
  });

  it("staff from another department cannot complete the task", () => {
    const s = buildSeed(now);
    const labStaff = DEMO_USERS.find((u) => u.deptId === "laboratory")!;
    const r = completeTask(s, p1043Task(s).id, labStaff, now);
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
  });

  it("a disabled transition does not advance the workflow", () => {
    const s = buildSeed(now);
    s.config = { ...s.config, steps: s.config.steps.map((x) => (x.deptId === "sample" ? { ...x, enabled: false } : x)) };
    const r = completeTask(s, p1043Task(s).id, admin, now);
    expect(r.ok).toBe(false);
    expect(r.state.patients.find((p) => p.id === "P-1043")!.currentDept).toBe("sample");
    expect(r.state.handovers[0]!.status).toBe("failed");
  });
});

describe("delays and config", () => {
  it("a task waiting past its department threshold is overdue", () => {
    const s = buildSeed(now);
    const t = { ...p1043Task(s), createdAt: now - 61 * MIN }; // sample threshold 60
    expect(isOverdue(s, t, now)).toBe(true);
    expect(isOverdue(s, { ...t, createdAt: now - 59 * MIN }, now)).toBe(false);
  });

  it("overdue alerts are generated only once", () => {
    const s = buildSeed(now);
    const once = evaluateDelays(s, now)!;
    expect(evaluateDelays(once, now)).toBeNull();
  });

  it("rejects circular workflows", () => {
    const s = buildSeed(now);
    const steps = s.config.steps.map((x) => (x.deptId === "followup" ? { ...x, next: "consultation" as const } : x));
    expect(validateConfig({ ...s.config, steps }, s.departments).length).toBeGreaterThan(0);
  });
});
