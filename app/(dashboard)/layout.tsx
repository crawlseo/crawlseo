import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const sites = await db.site.findMany({
    where: { userId: session.user?.id },
    select: { id: true, domain: true },
    orderBy: { domain: "asc" },
  });

  return (
    <AppShell
      email={session.user?.email}
      name={session.user?.name}
      image={session.user?.image}
      sites={sites}
    >
      {children}
    </AppShell>
  );
}
