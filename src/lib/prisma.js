const { PrismaClient } = require('@prisma/client');

const prismaClientSingleton = () => {
  const queryLog =
    process.env.NODE_ENV === "development" ||
    process.env.PRISMA_LOG_QUERIES === "true" ||
    process.env.PRISMA_LOG_QUERIES === "1";
  return new PrismaClient({
    log: queryLog ? ["query", "error", "warn"] : ["error"],
  });
};

const globalForPrisma = global;

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

module.exports = prisma;

