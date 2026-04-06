import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  // If logged in, redirect to dashboard
  if (session) {
    redirect("/dashboard");
  }

  // Otherwise, redirect to login
  redirect("/login");
}
