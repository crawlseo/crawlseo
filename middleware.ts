import { auth } from "@/lib/auth";

export default auth((req) => {
  // Auth middleware will run on all routes
  // Unauthenticated users will be redirected by NextAuth
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - login page
     */
    "/((?!_next/static|_next/image|favicon.ico|public|login).*)",
  ],
};
