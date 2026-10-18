export function developmentIdentity(
  env: Readonly<Record<string, string | undefined>>,
  hostname: string,
): string | null {
  if (env.SPLITCART_DEV_AUTH !== "1") return null;
  if (env.NODE_ENV === "production")
    throw new Error("Development identity is forbidden in production");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname))
    throw new Error("Development identity requires loopback");
  return "splitcart-local";
}
