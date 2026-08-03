import { describe, expect, it } from "vitest";
import { validateProviderContent } from "@/lib/providers";

describe("provider evidence validation", () => {
  it("rejects binary responses", () => {
    expect(validateProviderContent("audio/wav", "RIFF....WAVE").usable).toBe(false);
    expect(validateProviderContent("application/octet-stream", "binary\u0000data").usable).toBe(false);
  });

  it("accepts coherent text or json responses", () => {
    expect(validateProviderContent("application/json", JSON.stringify({ risk: "low", explanation: "A coherent explanation with enough detail." })).usable).toBe(true);
  });
});
