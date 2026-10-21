import { handleApiV1 } from "@/lib/api-v1/router";

// The read-only API (lib/api-v1/router.ts). Other methods get 405 from Next.
export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return handleApiV1(req);
}
