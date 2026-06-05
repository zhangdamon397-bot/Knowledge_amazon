import { describe, expect, it } from "vitest";
import { canUseCloud } from "../src/ingestion.js";

describe("sensitivity cloud policy", () => {
  it("allows normal internal content to use cloud processing", () => {
    expect(canUseCloud("public_internal", false)).toBe(true);
  });

  it("blocks client-confidential content by default", () => {
    expect(canUseCloud("client_confidential", false)).toBe(false);
  });

  it("allows client-confidential content only after explicit admin opt-in", () => {
    expect(canUseCloud("client_confidential", true)).toBe(true);
  });

  it("always blocks restricted content from cloud processing", () => {
    expect(canUseCloud("restricted", false)).toBe(false);
    expect(canUseCloud("restricted", true)).toBe(false);
  });
});
