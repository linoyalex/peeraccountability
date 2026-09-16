import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email();
const loopbackHostPattern = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

export function parseDevLoginEmails(raw: string | undefined): string[] {
  const emails = (raw ?? "")
    .split(",")
    .map((email) => emailSchema.safeParse(email))
    .filter((result) => result.success)
    .map((result) => result.data);

  return [...new Set(emails)];
}

export function isLocalDevelopmentRequest(
  host: string | null,
  environment: string | undefined,
): boolean {
  return environment === "development" && loopbackHostPattern.test(host?.toLowerCase() ?? "");
}

export function isAllowedDevLoginEmail(email: unknown, allowedEmails: readonly string[]) {
  const parsed = emailSchema.safeParse(email);
  return parsed.success && allowedEmails.includes(parsed.data) ? parsed.data : null;
}
