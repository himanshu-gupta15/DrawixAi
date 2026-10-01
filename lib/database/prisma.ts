import { PrismaClient } from "@prisma/client";

// One client per process. globalThis is shared between the custom server (Q4 WebSocket)
// and Next.js route handlers, which are bundled as separate module graphs.
const g = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma = g.__prisma ?? (g.__prisma = new PrismaClient());
