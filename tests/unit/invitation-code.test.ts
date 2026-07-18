import { describe, expect, it } from "vitest";
import {
  generateInvitationCode,
  hashInvitationCode,
  normalizeInvitationCode,
} from "@/lib/services/invitation-service";

describe("shared invitation codes", () => {
  it("normalizes human input before hashing", () => {
    const code = "STAR-ABCDE-FGHIJ-KLMNO-PQRST";
    expect(normalizeInvitationCode(`  ${code.toLowerCase()}  `)).toBe(code);
    expect(hashInvitationCode(code.toLowerCase())).toBe(hashInvitationCode(code));
  });

  it("generates high-entropy display codes without storing plaintext assumptions", () => {
    const first = generateInvitationCode();
    const second = generateInvitationCode();
    expect(first).toMatch(/^STAR-[A-F0-9]{5}(?:-[A-F0-9]{5}){3}$/);
    expect(second).not.toBe(first);
    expect(hashInvitationCode(first)).toMatch(/^[a-f0-9]{64}$/);
  });
});
