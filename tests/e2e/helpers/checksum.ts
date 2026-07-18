import { createHash } from "node:crypto";

/** Build a validator-compatible checksum for deterministic E2E fixture content. */
export function fixtureChecksum(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}
