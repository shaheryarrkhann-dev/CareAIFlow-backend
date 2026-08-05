const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed...");

  // Create default tenant
  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      name: "Default Organization",
      slug: "default",
      isActive: true,
    },
  });

  console.log("Created tenant:", defaultTenant.name);

  // Create super admin user (NO TENANT - can access all tenants)
  const passwordHash = await bcrypt.hash('AliRaza@2024!Secure', 12);
  
  let existingUser = await prisma.user.findUnique({
    where: { email: 'alirazaarif95@gmail.com' }
  });

  if (!existingUser) {
    existingUser = await prisma.user.findUnique({
      where: { email: 'alirazaarif95@gmail.com' }
    });
  }

  const adminUser = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: 'Ali Raza',
          passwordHash: passwordHash,
          email: 'alirazaarif95@gmail.com', // Normalize to lowercase
          role: 'SUPER_ADMIN',
          isEmailVerified: true,
          isActive: true,
          tenantId: null,
        },
      })
    : await prisma.user.create({
        data: {
          email: 'alirazaarif95@gmail.com',
          passwordHash: passwordHash,
          name: 'Ali Raza',
          role: 'SUPER_ADMIN',
          isEmailVerified: true,
          isActive: true,
          tenantId: null, // No tenant - cross-tenant access
        },
      });

  console.log('Created/Updated super admin user (cross-tenant):', adminUser.email);
  console.log('\nSeed completed successfully! ✅');
  console.log('\nLogin credentials:');
  console.log('Super Admin: alirazaarif95@gmail.com / AliRaza@2024!Secure');
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

  