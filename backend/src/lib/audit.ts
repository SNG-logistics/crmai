import prisma from './prisma';

export async function createAuditLog(
  tenantId: string,
  userId: string | null,
  action: string,
  details: any,
  ipAddress?: string,
  userAgent?: string
) {
  try {
    return await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        details: typeof details === 'string' ? details : JSON.stringify(details),
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  } catch (error) {
    console.error('[AUDIT LOG] Error creating audit log:', error);
  }
}
