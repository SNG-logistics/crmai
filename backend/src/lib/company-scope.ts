/**
 * company-scope — สิทธิ์การเข้าถึงราย "บริษัท" ของ user
 *
 * กติกา:
 *  - user ที่ไม่มีแถวใน UserCompany เลย → เข้าถึงได้ "ทุกบริษัท" ใน tenant (owner/superadmin/admin รวม)
 *  - user ที่มีแถว → จำกัดเฉพาะบริษัทที่ระบุเท่านั้น (แอดมินที่ถูกล็อกให้ดูบางบริษัท)
 */
import prisma from './prisma';

// คืน companyId[] ที่ user เข้าถึงได้ ; null = ไม่จำกัด (ทุกบริษัทใน tenant)
export async function getUserCompanyIds(userId: string): Promise<string[] | null> {
  const rows = await prisma.userCompany.findMany({ where: { userId }, select: { companyId: true } });
  if (rows.length === 0) return null;
  return rows.map((r) => r.companyId);
}

// ตรวจว่า user (ที่มี allowed list) เข้าถึง companyId นี้ได้ไหม
export function canAccessCompany(allowed: string[] | null, companyId: string | null | undefined): boolean {
  if (allowed === null) return true;         // ไม่จำกัด
  if (!companyId) return false;               // ถูกจำกัด แต่ข้อมูลไม่มีบริษัท → ปฏิเสธ
  return allowed.includes(companyId);
}

// บริษัทเริ่มต้น (ตัวแรก) ของ tenant — ใช้เป็น default เมื่อไม่ได้ระบุ companyId
export async function defaultCompanyId(tenantId: string): Promise<string | null> {
  const c = await prisma.company.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  return c?.id ?? null;
}
