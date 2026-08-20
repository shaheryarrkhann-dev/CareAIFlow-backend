/**
 * Seed permissions for the Role & Permission Engine.
 * Run from project root: node scripts/seed-permissions.js
 */
const { PrismaClient } = require("@prisma/client");
const { PERMISSIONS } = require("../src/services/seed/rolePermissionCatalog.data");
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding permissions...");
  let created = 0;
  let skipped = 0;
  for (const p of PERMISSIONS) {
    try {
      await prisma.permission.upsert({
        where: {
          module_action: { module: p.module, action: p.action },
        },
        create: { module: p.module, action: p.action, name: p.name },
        update: { name: p.name },
      });
      created++;
    } catch (err) {
      if (err.code === "P2002") skipped++;
      else throw err;
    }
  }
  console.log(`Permissions seeded: ${created} upserted, ${skipped} skipped (duplicates).`);
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
