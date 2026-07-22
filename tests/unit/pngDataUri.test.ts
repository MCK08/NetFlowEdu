import { toPngDataUri } from "@features/answers/services/pngDataUri";

describe("toPngDataUri", () => {
  it("prefixes raw base64 (react-native-svg's actual toDataURL output) with the PNG data URI scheme", () => {
    expect(toPngDataUri("iVBORw0KGgoAAAANSU")).toBe("data:image/png;base64,iVBORw0KGgoAAAANSU");
  });

  it("leaves an already-prefixed data URI unchanged", () => {
    const uri = "data:image/png;base64,iVBORw0KGgoAAAANSU";
    expect(toPngDataUri(uri)).toBe(uri);
  });

  it("trims surrounding whitespace before prefixing", () => {
    expect(toPngDataUri("  iVBORw0KGgo  ")).toBe("data:image/png;base64,iVBORw0KGgo");
  });

  it("rejects an empty export instead of producing an unusable data URI", () => {
    expect(toPngDataUri("")).toBeNull();
  });

  it("rejects a whitespace-only export", () => {
    expect(toPngDataUri("   ")).toBeNull();
  });

  it("rejects an already-prefixed data URI with no payload after the comma", () => {
    expect(toPngDataUri("data:image/png;base64,")).toBeNull();
  });

  it("every non-null result includes the data:image/png;base64, scheme uploadImage() branches on", () => {
    const result = toPngDataUri("someBase64Payload");
    expect(result).not.toBeNull();
    expect(result?.startsWith("data:image/png;base64,")).toBe(true);
  });
});
