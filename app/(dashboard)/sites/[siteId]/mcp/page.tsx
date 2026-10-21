import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { instanceOrigin } from "@/lib/instance-origin";
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

  const settings = await db.userSettings.findUnique({ where: { userId: site.userId }, select: { mcpEnabled: true } });
  const origin = await instanceOrigin();

  return (
    <div>
      <PageHeader
        title="AI & MCP"
        description="Let your AI agent read your SEO data through the Model Context Protocol. Read-only."
      />
      <McpPageContent endpoint={`${origin}/mcp`} origin={origin} enabled={settings?.mcpEnabled ?? false} />
    </div>
  );
}
