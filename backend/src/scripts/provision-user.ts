import dotenv from 'dotenv';
dotenv.config();

import prisma from '../lib/prisma';
import { provisionFirebaseUser } from '../lib/firebase-users';
import { isFirebaseEnabled, firebaseInitError } from '../lib/firebase-admin';

/**
 * Provision (or update) a user in BOTH the local DB and Firebase Auth.
 *
 *   $env:PROV_EMAIL="test@mail.com"; $env:PROV_ROLE="admin"; $env:PROV_PASSWORD="Test@1234"; npm run provision-user
 *
 * Env:
 *   PROV_EMAIL (required), PROV_ROLE (default admin), PROV_PASSWORD (optional,
 *   set it to allow email/password login), PROV_TENANT_SLUG (default demo),
 *   PROV_NAME (display name).
 */
async function main() {
  const email = (process.env.PROV_EMAIL || '').trim().toLowerCase();
  const role = process.env.PROV_ROLE || 'admin';
  const password = process.env.PROV_PASSWORD || undefined;
  const tenantSlug = process.env.PROV_TENANT_SLUG || 'demo';
  const displayName = process.env.PROV_NAME || email.split('@')[0];

  if (!email) { console.error('❌ Set PROV_EMAIL'); process.exit(1); }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) { console.error(`❌ Tenant "${tenantSlug}" not found`); process.exit(1); }

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email } },
    create: { tenantId: tenant.id, email, username: email.split('@')[0], displayName, role, isActive: true },
    update: { role, isActive: true },
  });
  console.log(`✅ Local user ready: ${user.id} (role: ${user.role}, tenant: ${tenantSlug})`);

  if (!isFirebaseEnabled()) {
    console.warn('⚠️  Firebase not configured — local only:', firebaseInitError());
  } else {
    const uid = await provisionFirebaseUser({
      email, password, displayName,
      claims: { tenantId: tenant.id, role: user.role, userId: user.id },
    });
    if (uid) {
      await prisma.user.update({ where: { id: user.id }, data: { firebaseUid: uid } });
      console.log(`✅ Firebase user ready: ${uid}`);
      console.log(password ? '   Login: Google OR email/password' : '   Login: Google only (no password set)');
    }
  }
}

main()
  .catch((e) => { console.error('❌ provision-user failed:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); process.exit(); });
