import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getServerSession } from "next-auth";
import { developmentIdentity } from "./dev-identity";
import { ensureOwner } from "./receipts";
import { AppError } from "@/domain/errors";
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : [],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.ownerId = await ensureOwner(
          account.provider,
          account.providerAccountId,
          profile?.name ?? "You",
        );
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = String(token.ownerId ?? "");
      return session;
    },
  },
};
export async function ownerFor(request: Request): Promise<string> {
  let dev: string | null;
  try {
    dev = developmentIdentity(process.env, new URL(request.url).hostname);
  } catch {
    throw new AppError("UNAUTHENTICATED", 401);
  }
  if (dev) return ensureOwner("development", dev);
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    throw new AppError("UNAUTHENTICATED", 401, "Sign in to continue.");
  return session.user.id;
}
