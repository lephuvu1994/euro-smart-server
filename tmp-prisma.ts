import prisma from './apps/mcp-server/src/prisma.js';

async function main() {
  try {
    const p = await prisma.partner.findMany({
      select: {
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        quotas: {
          select: {
            activatedCount: true,
            maxQuantity: true,
            licenseDays: true,
            isActive: true,
            deviceModel: { select: { code: true, name: true } },
          },
        },
      },
    });
    console.log("SUCCESS:", JSON.stringify(p, null, 2));
  } catch (err) {
    console.error("PRISMA ERROR:", err);
  } finally {
    await prisma.$disconnect();
  }
}
main();
