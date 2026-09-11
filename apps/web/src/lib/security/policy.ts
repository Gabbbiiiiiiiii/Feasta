export function isAllowedOrigin(
  originValue: string | null,
  allowedOrigins: readonly string[],
): boolean {
  if (!originValue) return false;
  try {
    const origin = new URL(originValue);
    if (origin.origin !== originValue || !["http:", "https:"].includes(origin.protocol)) {
      return false;
    }
    return allowedOrigins.includes(origin.origin);
  } catch {
    return false;
  }
}

export function configuredAllowedOrigins(value: string | undefined): string[] {
  return [...new Set((value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => {
      try {
        return new URL(item).origin === item;
      } catch {
        return false;
      }
    }))];
}

export function isSafeRelativeReturnTo(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      decoded.includes("\r") ||
      decoded.includes("\n")
    ) {
      return false;
    }
    const base = new URL("https://feasta.invalid");
    return new URL(value, base).origin === base.origin;
  } catch {
    return false;
  }
}

export function parseCookie(cookieHeader: string | null, name: string): string | null {
  const prefix = `${name}=`;
  const entry = cookieHeader
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return null;
  }
}

export function sessionCookiePolicy(production: boolean, maxAge: number) {
  return {
    httpOnly: true as const,
    secure: production,
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge,
  };
}

export async function verifyRevocationAwareSession<T>(
  cookie: string,
  verifier: (value: string, checkRevoked: boolean) => Promise<T>,
  checkRevoked = true,
): Promise<T> {
  if (!cookie) throw new Error("Session cookie is missing.");
  return verifier(cookie, checkRevoked);
}

export function isRoleAllowed(
  actualRole: string,
  allowedRoles: readonly string[],
): boolean {
  return allowedRoles.includes(actualRole);
}
