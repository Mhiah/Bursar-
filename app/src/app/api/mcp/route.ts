import { handleMcp } from "@/lib/mcp";

export const dynamic = "force-dynamic";

// For software that sends the key as "Authorization: Bearer bsk_…".
export const GET = (req: Request) => handleMcp(req);
export const POST = (req: Request) => handleMcp(req);
export const DELETE = (req: Request) => handleMcp(req);
