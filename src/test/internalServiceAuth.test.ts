import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bearerToken,
  isInternalServiceRequest,
  isServiceRoleCredential,
  looksLikeJwt,
  parseJwtClaims,
  verifyServiceRoleJwt,
} from "../../supabase/functions/_shared/internal-auth";

function unsignedJwt(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `eyJhbGciOiJub25lIn0.${b64}.sig`;
}

describe("internal service auth", () => {
  const secretKey = "sb_secret_current_edge_key";
  const vaultJwt = unsignedJwt({ role: "service_role", ref: "nekdjoquirhecmejuoba", exp: 4102444800 });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses JWT claims from the payload segment", () => {
    expect(parseJwtClaims(vaultJwt)?.role).toBe("service_role");
    expect(parseJwtClaims("not-a-jwt")).toBeNull();
    expect(parseJwtClaims(secretKey)).toBeNull();
    expect(looksLikeJwt(vaultJwt)).toBe(true);
    expect(looksLikeJwt(secretKey)).toBe(false);
  });

  it("accepts the current Edge service key by exact match only", () => {
    expect(isServiceRoleCredential(secretKey, secretKey)).toBe(true);
    expect(isServiceRoleCredential("other", secretKey)).toBe(false);
  });

  it("rejects an unsigned JWT that only claims service_role", () => {
    expect(isServiceRoleCredential(vaultJwt, secretKey)).toBe(false);
  });

  it("rejects a user JWT", () => {
    const userJwt = unsignedJwt({ role: "authenticated", sub: "user-1" });
    expect(isServiceRoleCredential(userJwt, secretKey)).toBe(false);
  });

  it("does not treat a forged Vault JWT header as authenticated", async () => {
    const req = new Request("https://example.test", {
      headers: { "x-internal-service-key": vaultJwt },
    });
    expect(await isInternalServiceRequest(req, secretKey)).toBe(false);
  });

  it("accepts Authorization Bearer with the Edge key", async () => {
    const req = new Request("https://example.test", {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    expect(await isInternalServiceRequest(req, secretKey)).toBe(true);
    expect(bearerToken(req)).toBe(secretKey);
  });

  it("rejects an unauthenticated request", async () => {
    const req = new Request("https://example.test");
    expect(await isInternalServiceRequest(req, secretKey)).toBe(false);
  });

  it("rejects a forged JWT even when PostgREST is reachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Invalid JWT" }), { status: 401 })),
    );
    expect(await verifyServiceRoleJwt(vaultJwt, "https://example.supabase.co")).toBe(false);
    const req = new Request("https://example.test", {
      headers: { "x-internal-service-key": vaultJwt },
    });
    expect(
      await isInternalServiceRequest(req, secretKey, { supabaseUrl: "https://example.supabase.co" }),
    ).toBe(false);
  });

  it("accepts a Vault JWT only after PostgREST verifies the signature", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ id: 1 }]), { status: 200 })));
    expect(await verifyServiceRoleJwt(vaultJwt, "https://example.supabase.co")).toBe(true);
    const req = new Request("https://example.test", {
      headers: { "x-internal-service-key": vaultJwt },
    });
    expect(
      await isInternalServiceRequest(req, secretKey, { supabaseUrl: "https://example.supabase.co" }),
    ).toBe(true);
  });
});
