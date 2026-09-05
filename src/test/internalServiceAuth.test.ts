import { describe, expect, it } from "vitest";
import {
  bearerToken,
  isInternalServiceRequest,
  isServiceRoleCredential,
  parseJwtClaims,
} from "../../supabase/functions/_shared/internal-auth";

function unsignedJwt(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `eyJhbGciOiJub25lIn0.${b64}.sig`;
}

describe("internal service auth", () => {
  const secretKey = "sb_secret_current_edge_key";
  const vaultJwt = unsignedJwt({ role: "service_role", ref: "nekdjoquirhecmejuoba" });

  it("parses JWT claims from the payload segment", () => {
    expect(parseJwtClaims(vaultJwt)?.role).toBe("service_role");
    expect(parseJwtClaims("not-a-jwt")).toBeNull();
    expect(parseJwtClaims(secretKey)).toBeNull();
  });

  it("accepts the current Edge service key by exact match", () => {
    expect(isServiceRoleCredential(secretKey, secretKey)).toBe(true);
    expect(isServiceRoleCredential("other", secretKey)).toBe(false);
  });

  it("accepts a Vault service_role JWT that does not equal the Edge key", () => {
    expect(isServiceRoleCredential(vaultJwt, secretKey)).toBe(true);
  });

  it("rejects a user JWT", () => {
    const userJwt = unsignedJwt({ role: "authenticated", sub: "user-1" });
    expect(isServiceRoleCredential(userJwt, secretKey)).toBe(false);
  });

  it("accepts x-internal-service-key when it is the Vault JWT", () => {
    const req = new Request("https://example.test", {
      headers: { "x-internal-service-key": vaultJwt },
    });
    expect(isInternalServiceRequest(req, secretKey)).toBe(true);
  });

  it("accepts Authorization Bearer with the Edge key", () => {
    const req = new Request("https://example.test", {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    expect(isInternalServiceRequest(req, secretKey)).toBe(true);
    expect(bearerToken(req)).toBe(secretKey);
  });

  it("rejects an unauthenticated request", () => {
    const req = new Request("https://example.test");
    expect(isInternalServiceRequest(req, secretKey)).toBe(false);
  });
});
