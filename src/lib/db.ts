import { PrismaClient } from '@prisma/client';

// One Prisma client per server process (avoids exhausting connections in dev hot reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
