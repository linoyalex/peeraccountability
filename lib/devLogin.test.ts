import { describe, expect, it } from "vitest";

import {
  isAllowedDevLoginEmail,
  isLocalDevelopmentRequest,
  parseDevLoginEmails,
} from "./devLogin";

describe("development login guard", () => {
  it("normalizes, validates, and de-duplicates the configured emails", () => {
    expect(
      parseDevLoginEmails(" TEST@example.com,invalid, second@example.com, test@example.com "),
    ).toEqual(["test@example.com", "second@example.com"]);
  });

  it("has no allowed identities when configuration is absent", () => {
    expect(parseDevLoginEmails(undefined)).toEqual([]);
  });

  it.each(["localhost", "localhost:3000", "127.0.0.1:3000", "[::1]:3000"])(
    "allows the loopback host %s in development",
    (host) => {
      expect(isLocalDevelopmentRequest(host, "development")).toBe(true);
    },
  );

  it("rejects production and non-loopback hosts", () => {
    expect(isLocalDevelopmentRequest("localhost:3000", "production")).toBe(false);
    expect(isLocalDevelopmentRequest("192.168.1.20:3000", "development")).toBe(false);
    expect(isLocalDevelopmentRequest("localhost.example.com", "development")).toBe(false);
    expect(isLocalDevelopmentRequest(null, "development")).toBe(false);
  });

  it("accepts only a configured email", () => {
    const allowed = ["one@example.com", "two@example.com"];

    expect(isAllowedDevLoginEmail(" TWO@example.com ", allowed)).toBe("two@example.com");
    expect(isAllowedDevLoginEmail("other@example.com", allowed)).toBeNull();
    expect(isAllowedDevLoginEmail(null, allowed)).toBeNull();
  });
});
