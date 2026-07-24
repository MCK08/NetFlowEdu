import { buildOrganizationName } from "../../functions/src/onboarding/organizationName";

describe("buildOrganizationName", () => {
  it("builds a personal-workspace name from the teacher's display name", () => {
    expect(buildOrganizationName("Ayşe Yılmaz")).toBe("Ayşe Yılmaz Sınıfları");
  });

  it("is deterministic for the same input", () => {
    expect(buildOrganizationName("Mert")).toBe(buildOrganizationName("Mert"));
  });

  it("produces different names for different teachers", () => {
    expect(buildOrganizationName("Ayşe")).not.toBe(buildOrganizationName("Mert"));
  });
});
