import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./db";
import { isSignInAllowed } from "./registration";
import { storeSignInTokens } from "./google/token-store";

// Skipped during `next build` so the Docker image can be built without real
// credentials.  NEXT_PHASE is set by Next.js; SKIP_ENV_VALIDATION is a manual
// escape hatch for other build toolchains.
const isBuild =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.SKIP_ENV_VALIDATION === "1";
if (!isBuild && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)) {
  throw new Error("Missing Google OAuth credentials");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/webmasters.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    signIn({ account }) {
      return isSignInAllowed(account);
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (account?.access_token && user?.email) {
        // Save Google OAuth tokens (encrypted) after user is created by adapter
        try {
          await storeSignInTokens(db, user.email, account);
        } catch (error) {
          console.error("Failed to save Google tokens:", error);
        }
      }
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "database",
  },
  secret: process.env.NEXTAUTH_SECRET,
});
