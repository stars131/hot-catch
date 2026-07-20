import { describe, expect, it, vi } from "vitest";
import { runOrderedBackends } from "@/lib/providers/ordered-backend-router";

describe("ordered backend router", () => {
  it("uses the first successful backend and stops probing", async () => {
    const second = vi.fn(async () => "second");
    const result = await runOrderedBackends([
      { id: "first", failureReason: "FIRST_FAILED", run: async () => "first" },
      { id: "second", failureReason: "SECOND_FAILED", run: second },
    ]);

    expect(result).toMatchObject({
      ok: true,
      value: "first",
      activeBackend: "first",
      attempts: [{ backend: "first", status: "succeeded" }],
    });
    expect(second).not.toHaveBeenCalled();
  });

  it("continues after unavailable and failed candidates without exposing raw errors", async () => {
    const result = await runOrderedBackends([
      {
        id: "missing",
        availability: { available: false, reason: "CREDENTIAL_NOT_CONFIGURED" },
        failureReason: "UNUSED",
        run: async () => "missing",
      },
      {
        id: "unstable",
        failureReason: "PROVIDER_UNAVAILABLE",
        run: async () => {
          throw new Error("secret upstream response");
        },
      },
      { id: "fallback", failureReason: "FALLBACK_FAILED", run: async () => "safe" },
    ]);

    expect(result).toEqual({
      ok: true,
      value: "safe",
      activeBackend: "fallback",
      attempts: [
        {
          backend: "missing",
          status: "skipped",
          reason: "CREDENTIAL_NOT_CONFIGURED",
        },
        {
          backend: "unstable",
          status: "failed",
          reason: "PROVIDER_UNAVAILABLE",
        },
        { backend: "fallback", status: "succeeded" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("secret upstream response");
  });

  it("supports a known preference and ignores a stale preference", async () => {
    const preferred = await runOrderedBackends(
      [
        { id: "primary", failureReason: "PRIMARY_FAILED", run: async () => "primary" },
        { id: "secondary", failureReason: "SECONDARY_FAILED", run: async () => "secondary" },
      ],
      { preferredBackend: "secondary" },
    );
    const stale = await runOrderedBackends(
      [
        { id: "primary", failureReason: "PRIMARY_FAILED", run: async () => "primary" },
        { id: "secondary", failureReason: "SECONDARY_FAILED", run: async () => "secondary" },
      ],
      { preferredBackend: "removed-backend" },
    );

    expect(preferred).toMatchObject({ activeBackend: "secondary" });
    expect(stale).toMatchObject({ activeBackend: "primary" });
  });

  it("returns a complete attempt ledger when every backend fails", async () => {
    const result = await runOrderedBackends([
      {
        id: "primary",
        failureReason: "PRIMARY_FAILED",
        run: async () => Promise.reject(new Error("primary raw error")),
      },
      {
        id: "fallback",
        failureReason: "FALLBACK_FAILED",
        run: async () => Promise.reject(new Error("fallback raw error")),
      },
    ]);

    expect(result).toEqual({
      ok: false,
      attempts: [
        { backend: "primary", status: "failed", reason: "PRIMARY_FAILED" },
        { backend: "fallback", status: "failed", reason: "FALLBACK_FAILED" },
      ],
    });
  });

  it("rejects duplicate backend ids", async () => {
    await expect(
      runOrderedBackends([
        { id: "same", failureReason: "FAILED", run: async () => 1 },
        { id: "same", failureReason: "FAILED", run: async () => 2 },
      ]),
    ).rejects.toThrow("Duplicate backend id: same");
  });
});
