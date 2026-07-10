"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("../generated/prisma/client");
const globalForPrisma = globalThis;
function createPrismaClient() {
    const adapter = new adapter_pg_1.PrismaPg({ connectionString: process.env.DATABASE_URL });
    return new client_1.PrismaClient({ adapter, log: ['error'] });
}
exports.prisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = exports.prisma;
