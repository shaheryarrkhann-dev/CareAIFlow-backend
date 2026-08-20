const { PrismaClient } = require("@prisma/client");
const fs = require("fs");

function runningInDocker() {
  return process.env.RUNNING_IN_DOCKER === "true" || fs.existsSync("/.dockerenv");
}

function normalizeDatabaseUrlForDocker() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !runningInDocker()) return;

  // Inside a container, localhost points to the container itself.
  // Rewrite only localhost/127.0.0.1 to a host that Docker can reach.
  if (!/(@localhost:|@127\.0\.0\.1:)/.test(dbUrl)) return;

  const dockerDbHost = process.env.DOCKER_DB_HOST || "host.docker.internal";
  process.env.DATABASE_URL = dbUrl.replace(
    /@(?:localhost|127\.0\.0\.1):/g,
    `@${dockerDbHost}:`
  );
}

normalizeDatabaseUrlForDocker();

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

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

module.exports = prisma;

