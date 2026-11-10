import { handleMcp } from "@/lib/mcp";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

// The secret link an owner pastes into their AI assistant as a custom connector.
export const GET = async (req: Request, { params }: Ctx) => handleMcp(req, (await params).key);
export const POST = async (req: Request, { params }: Ctx) => handleMcp(req, (await params).key);
export const DELETE = async (req: Request, { params }: Ctx) => handleMcp(req, (await params).key);
