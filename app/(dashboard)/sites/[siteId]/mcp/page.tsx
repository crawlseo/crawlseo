import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { McpPageContent } from "@/components/mcp/mcp-page-content";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function McpPage({ params }: Props) {
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
        title="AI & MCP"
        description="Connect your AI agent to crawlseo through the Model Context Protocol."
      />
      <McpPageContent />
    </div>
  );
}
