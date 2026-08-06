import {
  extractVisionText,
  parseVisionResponse,
  safeSearchToSignal,
} from "../../functions/src/moderation/visionProvider";

// Every branch below is a Vision response this code must survive. None of
// them can be triggered on demand against the live API — you cannot ask
// Vision to return a malformed body or a quota error — so the parsing is
// pure and proven here instead.

describe("safeSearchToSignal", () => {
  const clean = {
    adult: "VERY_UNLIKELY",
    spoof: "VERY_UNLIKELY",
    medical: "VERY_UNLIKELY",
    violence: "VERY_UNLIKELY",
    racy: "VERY_UNLIKELY",
  } as const;

  it("clears an image where every consulted category is unlikely", () => {
    expect(safeSearchToSignal(clean).outcome).toBe("clean");
  });

  it("blocks LIKELY and VERY_LIKELY adult content", () => {
    expect(safeSearchToSignal({ ...clean, adult: "LIKELY" }).outcome).toBe("block");
    expect(safeSearchToSignal({ ...clean, adult: "VERY_LIKELY" }).outcome).toBe("block");
  });

  it("blocks violence and racy at the same thresholds", () => {
    expect(safeSearchToSignal({ ...clean, violence: "VERY_LIKELY" }).outcome).toBe("block");
    expect(safeSearchToSignal({ ...clean, racy: "LIKELY" }).outcome).toBe("block");
  });

  it("sends POSSIBLE to review rather than blocking or clearing it", () => {
    const signal = safeSearchToSignal({ ...clean, racy: "POSSIBLE" });
    expect(signal.outcome).toBe("review");
    expect(signal.categories).toContain("racy");
  });

  it("does NOT block on medical, so a biology diagram survives", () => {
    // A drawing of an organ scores high on `medical`. Refusing it would
    // break exactly the schoolwork this app exists for.
    expect(safeSearchToSignal({ ...clean, medical: "VERY_LIKELY" }).outcome).toBe("clean");
  });

  it("does NOT block on spoof, which only means 'looks like a meme'", () => {
    expect(safeSearchToSignal({ ...clean, spoof: "VERY_LIKELY" }).outcome).toBe("clean");
  });

  it("reports which categories fired, without a score", () => {
    const signal = safeSearchToSignal({ ...clean, adult: "LIKELY", violence: "VERY_LIKELY" });
    expect(signal.categories.sort()).toEqual(["adult", "violence"]);
  });

  it("treats a missing annotation as unavailable, never clean", () => {
    expect(safeSearchToSignal(undefined).outcome).toBe("unavailable");
  });

  it("treats an all-UNKNOWN verdict as unavailable, never clean", () => {
    // Vision returns UNKNOWN when it could not assess. Reading that as clean
    // is precisely the "absence of evidence is evidence of safety" mistake.
    const unknown = { adult: "UNKNOWN", violence: "UNKNOWN", racy: "UNKNOWN" } as const;
    expect(safeSearchToSignal(unknown).outcome).toBe("unavailable");
  });

  it("marks a block as non-retryable and an outage as retryable", () => {
    expect(safeSearchToSignal({ ...clean, adult: "VERY_LIKELY" }).retryable).toBe(false);
    expect(safeSearchToSignal(undefined).retryable).toBe(true);
  });
});

describe("extractVisionText", () => {
  it("prefers fullTextAnnotation", () => {
    const result = extractVisionText({ fullTextAnnotation: { text: "merhaba dünya" } });
    expect(result).toEqual({ text: "merhaba dünya", available: true });
  });

  it("falls back to the first textAnnotations entry", () => {
    const result = extractVisionText({ textAnnotations: [{ description: "cevap 42" }] });
    expect(result).toEqual({ text: "cevap 42", available: true });
  });

  it("treats an EMPTY textAnnotations array as 'ran, found nothing'", () => {
    // A plain diagram with no writing. available:true is the honest answer —
    // very different from OCR never having run.
    expect(extractVisionText({ textAnnotations: [] })).toEqual({ text: "", available: true });
  });

  it("reports unavailable when neither shape is present", () => {
    expect(extractVisionText({})).toEqual({ text: "", available: false });
  });
});

describe("parseVisionResponse", () => {
  const okBody = {
    responses: [
      {
        safeSearchAnnotation: {
          adult: "VERY_UNLIKELY",
          violence: "VERY_UNLIKELY",
          racy: "VERY_UNLIKELY",
        },
        fullTextAnnotation: { text: "x + y = 5" },
      },
    ],
  };

  it("parses a well-formed response", () => {
    const result = parseVisionResponse(okBody);
    expect(result.image.outcome).toBe("clean");
    expect(result.extractedText).toBe("x + y = 5");
    expect(result.imageTextAvailable).toBe(true);
  });

  it("returns unavailable for a top-level API error (quota, API disabled)", () => {
    // This is the exact shape returned when vision.googleapis.com is not
    // enabled on the project — the state the project is in today.
    const result = parseVisionResponse({
      error: { code: 403, message: "Cloud Vision API has not been used in project" },
    });
    expect(result.image.outcome).toBe("unavailable");
    expect(result.imageTextAvailable).toBe(false);
  });

  it("returns unavailable for a per-image error", () => {
    const result = parseVisionResponse({ responses: [{ error: { code: 7, message: "denied" } }] });
    expect(result.image.outcome).toBe("unavailable");
  });

  it("returns unavailable for a missing or empty responses array", () => {
    expect(parseVisionResponse({}).image.outcome).toBe("unavailable");
    expect(parseVisionResponse({ responses: [] }).image.outcome).toBe("unavailable");
  });

  it("returns unavailable for a non-object payload", () => {
    expect(parseVisionResponse(null).image.outcome).toBe("unavailable");
    expect(parseVisionResponse("nope").image.outcome).toBe("unavailable");
  });

  it("never returns clean for any malformed input", () => {
    // The load-bearing property: no parse failure may look like a pass.
    const malformed = [null, undefined, "", 0, {}, { responses: {} }, { responses: [null] }];
    for (const payload of malformed) {
      expect(parseVisionResponse(payload).image.outcome).not.toBe("clean");
    }
  });

  it("surfaces a block even when OCR text is present and innocent", () => {
    const result = parseVisionResponse({
      responses: [
        {
          safeSearchAnnotation: { adult: "VERY_LIKELY", violence: "VERY_UNLIKELY", racy: "VERY_UNLIKELY" },
          fullTextAnnotation: { text: "matematik" },
        },
      ],
    });
    expect(result.image.outcome).toBe("block");
  });
});

describe("parseVisionResponse — partial failure", () => {
  it("returns unavailable when a top-level error accompanies a usable responses array", () => {
    // A partial failure: the body carries BOTH an error and something that
    // parses. Without the top-level error check the annotation below would
    // be read as a clean pass.
    const result = parseVisionResponse({
      error: { code: 8, message: "RESOURCE_EXHAUSTED" },
      responses: [
        {
          safeSearchAnnotation: {
            adult: "VERY_UNLIKELY",
            violence: "VERY_UNLIKELY",
            racy: "VERY_UNLIKELY",
          },
          fullTextAnnotation: { text: "cevap" },
        },
      ],
    });
    expect(result.image.outcome).toBe("unavailable");
    expect(result.imageTextAvailable).toBe(false);
  });
});
