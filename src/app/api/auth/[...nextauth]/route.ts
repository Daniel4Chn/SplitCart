import NextAuth from "next-auth";
import { authOptions } from "@/server/auth";
import { rateLimit, errorResponse } from "@/server/http";
const authHandler = NextAuth(authOptions);
async function handler(
  request: Request,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  try {
    rateLimit("auth-global", "entry", 300);
    return await authHandler(request, context);
  } catch (error) {
    return errorResponse(error);
  }
}
export { handler as GET, handler as POST };
