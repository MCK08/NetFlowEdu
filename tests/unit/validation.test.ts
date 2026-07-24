import {
  hasErrors,
  validateDisplayName,
  validateEmail,
  validateForgotPasswordInput,
  validateLoginInput,
  validatePassword,
  validatePasswordConfirmation,
  validateRegisterInput,
  validateTermsAccepted,
  validateUsername,
} from "@features/authentication/validation";

describe("validateDisplayName", () => {
  it("rejects empty input", () => {
    expect(validateDisplayName("")).toBe("Görünen ad gerekli.");
  });

  it("rejects names shorter than 2 characters after trim", () => {
    expect(validateDisplayName(" a ")).toBe("Görünen ad en az 2 karakter olmalı.");
  });

  it("rejects names longer than 60 characters", () => {
    expect(validateDisplayName("a".repeat(61))).toBe("Görünen ad en fazla 60 karakter olabilir.");
  });

  it("accepts a valid name", () => {
    expect(validateDisplayName("Ayşe Yılmaz")).toBeUndefined();
  });

  // displayName is a public, chosen name — not a legal name — and may
  // freely contain spaces ("Sinem Hoca", "Matematikçi Burak").
  it("accepts a display name containing multiple spaces", () => {
    expect(validateDisplayName("Matematikçi Burak Yıldız")).toBeUndefined();
  });
});

describe("validateUsername", () => {
  it("rejects empty input", () => {
    expect(validateUsername("")).toBe("Kullanıcı adı gerekli.");
  });

  it("rejects a username containing a space", () => {
    expect(validateUsername("sinem mat")).toBeDefined();
  });

  it("rejects a username containing special characters", () => {
    expect(validateUsername("sinem@mat")).toBeDefined();
  });

  it("accepts a valid username", () => {
    expect(validateUsername("sinemmat")).toBeUndefined();
  });

  it("accepts underscores", () => {
    expect(validateUsername("sinem_mat")).toBeUndefined();
  });
});

describe("validateEmail", () => {
  it("rejects empty input", () => {
    expect(validateEmail("")).toBe("E-posta adresi gerekli.");
  });

  it("rejects malformed email", () => {
    expect(validateEmail("not-an-email")).toBe("Geçerli bir e-posta adresi girin.");
  });

  it("accepts a valid email regardless of case/whitespace", () => {
    expect(validateEmail("  Test@Example.com ")).toBeUndefined();
  });
});

describe("validatePassword", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePassword("Ab1")).toBe("Şifre en az 8 karakter olmalı.");
  });

  it("rejects passwords without an uppercase letter", () => {
    expect(validatePassword("lowercase1")).toBe("Şifre en az bir büyük harf içermeli.");
  });

  it("rejects passwords without a lowercase letter", () => {
    expect(validatePassword("UPPERCASE1")).toBe("Şifre en az bir küçük harf içermeli.");
  });

  it("rejects passwords without a number", () => {
    expect(validatePassword("NoNumbersHere")).toBe("Şifre en az bir rakam içermeli.");
  });

  it("accepts a valid password", () => {
    expect(validatePassword("Valid123")).toBeUndefined();
  });
});

describe("validatePasswordConfirmation", () => {
  it("rejects empty confirmation", () => {
    expect(validatePasswordConfirmation("Valid123", "")).toBe("Şifre tekrarı gerekli.");
  });

  it("rejects mismatched confirmation", () => {
    expect(validatePasswordConfirmation("Valid123", "Different1")).toBe("Şifreler eşleşmiyor.");
  });

  it("accepts a matching confirmation", () => {
    expect(validatePasswordConfirmation("Valid123", "Valid123")).toBeUndefined();
  });
});

describe("validateTermsAccepted", () => {
  it("rejects when not accepted", () => {
    expect(validateTermsAccepted(false)).toBe(
      "Devam etmek için kullanım koşullarını kabul etmelisiniz.",
    );
  });

  it("accepts when accepted", () => {
    expect(validateTermsAccepted(true)).toBeUndefined();
  });
});

describe("validateRegisterInput", () => {
  const validInput = {
    displayName: "Ayşe Yılmaz",
    username: "ayse_yilmaz",
    email: "ayse@example.com",
    password: "Valid123",
    confirmPassword: "Valid123",
    acceptedTerms: true,
    intendedRole: "student" as const,
  };

  it("returns no errors for fully valid student input", () => {
    expect(hasErrors(validateRegisterInput(validInput))).toBe(false);
  });

  it("collects every failing field", () => {
    const errors = validateRegisterInput({
      displayName: "",
      username: "",
      email: "bad",
      password: "weak",
      confirmPassword: "different",
      acceptedTerms: false,
      intendedRole: "student",
    });

    expect(Object.keys(errors).sort()).toEqual(
      ["acceptedTerms", "confirmPassword", "displayName", "email", "password", "username"].sort(),
    );
  });

  it("rejects a username shorter than 3 characters", () => {
    const errors = validateRegisterInput({ ...validInput, username: "ab" });
    expect(errors.username).toBeDefined();
  });

  it("rejects a username with invalid characters", () => {
    const errors = validateRegisterInput({ ...validInput, username: "ayse-yilmaz!" });
    expect(errors.username).toBeDefined();
  });

  it("accepts teacher input with no organization name field at all — the server generates it", () => {
    const errors = validateRegisterInput({ ...validInput, intendedRole: "teacher" });
    expect(hasErrors(errors)).toBe(false);
  });
});

describe("validateLoginInput", () => {
  it("requires both email and password", () => {
    const errors = validateLoginInput({ email: "", password: "" });
    expect(errors.email).toBeDefined();
    expect(errors.password).toBe("Şifre gerekli.");
  });

  it("does not validate password strength on login", () => {
    const errors = validateLoginInput({ email: "user@example.com", password: "x" });
    expect(hasErrors(errors)).toBe(false);
  });
});

describe("validateForgotPasswordInput", () => {
  it("requires a valid email", () => {
    const errors = validateForgotPasswordInput({ email: "bad" });
    expect(errors.email).toBe("Geçerli bir e-posta adresi girin.");
  });
});
