import {
  deriveTeacherDashboardStats,
  resolveGreeting,
} from "@features/teacher/services/teacherDashboardStats";
import { ClassRoom } from "@/types/class";

function classRoom(overrides: Partial<ClassRoom> = {}): ClassRoom {
  return {
    id: "class-1",
    name: "9-A Matematik",
    organizationId: "org-1",
    teacherId: "teacher-1",
    joinCode: "ABC123",
    createdAt: 0,
    updatedAt: 0,
    memberCount: 1,
    status: "active",
    ...overrides,
  };
}

describe("deriveTeacherDashboardStats", () => {
  it("reports all zeros for a teacher with no classes", () => {
    expect(deriveTeacherDashboardStats([])).toEqual({
      classCount: 0,
      activeClassCount: 0,
      memberCount: 0,
    });
  });

  it("counts every class the teacher owns", () => {
    const stats = deriveTeacherDashboardStats([
      classRoom({ id: "a" }),
      classRoom({ id: "b" }),
      classRoom({ id: "c" }),
    ]);
    expect(stats.classCount).toBe(3);
  });

  it("counts only active classes as active, without dropping archived ones from the total", () => {
    const stats = deriveTeacherDashboardStats([
      classRoom({ id: "a", status: "active" }),
      classRoom({ id: "b", status: "archived" }),
      classRoom({ id: "c", status: "active" }),
    ]);
    expect(stats.classCount).toBe(3);
    expect(stats.activeClassCount).toBe(2);
  });

  it("sums the denormalized member counts across classes", () => {
    const stats = deriveTeacherDashboardStats([
      classRoom({ id: "a", memberCount: 12 }),
      classRoom({ id: "b", memberCount: 7 }),
    ]);
    expect(stats.memberCount).toBe(19);
  });

  it("includes archived classes' members in the member total", () => {
    const stats = deriveTeacherDashboardStats([
      classRoom({ id: "a", memberCount: 5, status: "active" }),
      classRoom({ id: "b", memberCount: 3, status: "archived" }),
    ]);
    expect(stats.memberCount).toBe(8);
  });

  it("derives everything from the array alone — the same input always gives the same output", () => {
    const input = [classRoom({ id: "a", memberCount: 4 })];
    expect(deriveTeacherDashboardStats(input)).toEqual(deriveTeacherDashboardStats(input));
  });
});

describe("resolveGreeting", () => {
  function at(hour: number): Date {
    const date = new Date(2026, 6, 31, hour, 0, 0);
    return date;
  }

  it("greets the small hours as night", () => {
    expect(resolveGreeting(at(0))).toBe("İyi geceler");
    expect(resolveGreeting(at(5))).toBe("İyi geceler");
  });

  it("greets the morning", () => {
    expect(resolveGreeting(at(6))).toBe("Günaydın");
    expect(resolveGreeting(at(11))).toBe("Günaydın");
  });

  it("greets midday through the afternoon", () => {
    expect(resolveGreeting(at(12))).toBe("İyi günler");
    expect(resolveGreeting(at(17))).toBe("İyi günler");
  });

  it("greets the evening", () => {
    expect(resolveGreeting(at(18))).toBe("İyi akşamlar");
    expect(resolveGreeting(at(23))).toBe("İyi akşamlar");
  });

  it("always returns a non-empty greeting for every hour of the day", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(resolveGreeting(at(hour)).length).toBeGreaterThan(0);
    }
  });
});
