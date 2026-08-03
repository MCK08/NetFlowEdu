import {
  isSelectableRole,
  ROLE_OPTIONS,
  ROLE_SELECTION_MISSING_MESSAGE,
  ROLE_SELECTION_NOTE,
  validateRoleSelection,
} from "@features/authentication/services/rolePresentation";
import { validateRegisterInput } from "@features/authentication/validation";
import { RegisterFieldErrors, RegisterInput } from "@features/authentication/types";

describe("ROLE_OPTIONS", () => {
  it("offers exactly the two roles a person can actually request", () => {
    expect(ROLE_OPTIONS.map((option) => option.value)).toEqual(["student", "teacher"]);
  });

  // organization_admin / platform_admin are real UserRole values but are
  // only ever granted by adminSetUserRole. Offering them here would be
  // inventing a capability the sign-up flow does not have.
  it("never offers an admin role", () => {
    const values = ROLE_OPTIONS.map((option) => option.value as string);
    expect(values).not.toContain("organization_admin");
    expect(values).not.toContain("platform_admin");
  });

  it("gives every option a title, a description and its own accessibility label", () => {
    for (const option of ROLE_OPTIONS) {
      expect(option.title.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
      // The label must carry more than the title alone — a screen reader
      // user gets the card's whole meaning, not just its heading.
      expect(option.accessibilityLabel.length).toBeGreaterThan(option.title.length);
    }
  });

  it("describes what the account DOES, never what it is permitted to do", () => {
    // "yetki"/"izin"/"onaylandı" would imply the tap itself granted
    // something. The only authority is completeOnboarding, server-side.
    for (const option of ROLE_OPTIONS) {
      const text = `${option.title} ${option.description}`.toLowerCase();
      for (const forbidden of ["yetki", "izin", "onaylandı", "yönetici"]) {
        expect(text).not.toContain(forbidden);
      }
    }
  });
});

describe("ROLE_SELECTION_NOTE", () => {
  it("says the choice is applied by the server, not granted by the tap", () => {
    expect(ROLE_SELECTION_NOTE).toContain("sunucu");
  });
});

describe("isSelectableRole", () => {
  it("accepts exactly student and teacher", () => {
    expect(isSelectableRole("student")).toBe(true);
    expect(isSelectableRole("teacher")).toBe(true);
  });

  it("rejects an admin role, an unknown string, and every empty value", () => {
    expect(isSelectableRole("platform_admin")).toBe(false);
    expect(isSelectableRole("organization_admin")).toBe(false);
    expect(isSelectableRole("headmaster")).toBe(false);
    expect(isSelectableRole("")).toBe(false);
    expect(isSelectableRole(null)).toBe(false);
    expect(isSelectableRole(undefined)).toBe(false);
    expect(isSelectableRole(0)).toBe(false);
  });
});

describe("validateRoleSelection", () => {
  it("passes a real role", () => {
    expect(validateRoleSelection("student")).toBeUndefined();
    expect(validateRoleSelection("teacher")).toBeUndefined();
  });

  // A null requestedRole is what permanently stranded accounts at Stage 2
  // in the 2026-07-27 incident, so "no role" must never be submittable.
  it("blocks a missing or unrecognized role with an actionable message", () => {
    expect(validateRoleSelection(null)).toBe(ROLE_SELECTION_MISSING_MESSAGE);
    expect(validateRoleSelection(undefined)).toBe(ROLE_SELECTION_MISSING_MESSAGE);
    expect(validateRoleSelection("admin")).toBe(ROLE_SELECTION_MISSING_MESSAGE);
  });
});

describe("validateRegisterInput integration", () => {
  const VALID_FIELDS = {
    displayName: "Ada Yılmaz",
    username: "ada",
    email: "ada@example.com",
    password: "Guclu1Sifre",
    confirmPassword: "Guclu1Sifre",
    acceptedTerms: true,
  };

  function validateWithRole(intendedRole: unknown): RegisterFieldErrors {
    return validateRegisterInput({ ...VALID_FIELDS, intendedRole } as RegisterInput);
  }

  // The role check is WIRED INTO the register validator, not merely
  // available as a standalone helper — "no role selected" has to be
  // unreachable from the form, not just detectable in principle.
  it("surfaces a missing role as a register field error", () => {
    expect(validateWithRole(undefined).intendedRole).toBe(ROLE_SELECTION_MISSING_MESSAGE);
    expect(validateWithRole(null).intendedRole).toBe(ROLE_SELECTION_MISSING_MESSAGE);
    expect(validateWithRole("platform_admin").intendedRole).toBe(ROLE_SELECTION_MISSING_MESSAGE);
  });

  it("reports no role error, and no other error, for a valid selection", () => {
    for (const role of ["student", "teacher"]) {
      expect(validateWithRole(role)).toEqual({});
    }
  });
});
