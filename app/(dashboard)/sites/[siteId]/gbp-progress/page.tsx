import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { GBPProgressClient } from "@/components/research/gbp-progress-client";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function GBPProgressPage({ params }: Props) {
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true },
  });
  if (!site || site.userId !== session?.user?.id) redirect("/sites");

  return (
    <div>
      <PageHeader
        eyebrow={site.domain}
        title="GBP Progress Report"
        description="Google Business Profile views, searches, and customer actions over time"
      />
      <GBPProgressClient siteId={siteId} />
    </div>
  );
}
