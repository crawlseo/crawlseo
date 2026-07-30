import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./db";

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
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
          scope:
            "openid email profile https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/business.manage",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
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
        // Save Google OAuth tokens after user is created by adapter
        try {
          await db.user.update({
            where: { email: user.email },
            data: {
              googleTokens: {
                accessToken: account.access_token,
                refreshToken: account.refresh_token,
                // account.expires_at is Unix seconds; store ms to match
                // refreshAccessToken() and getAccessToken()'s Date.now() checks.
                expiresAt: account.expires_at
                  ? account.expires_at * 1000
                  : undefined,
                tokenType: account.token_type,
                scope: account.scope,
              },
            },
          });
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
