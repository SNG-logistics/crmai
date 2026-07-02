import dotenv from 'dotenv';
dotenv.config();

import prisma from '../lib/prisma';
import { provisionFirebaseUser } from '../lib/firebase-users';
import { isFirebaseEnabled, firebaseInitError } from '../lib/firebase-admin';

/**
 * Provision the platform owner as a superadmin in BOTH the local DB and Firebase
 * Auth, with the right custom claims so the ID token carries tenant + role.
 *
 * Configure via env (with sensible defaults):
 *   OWNER_EMAIL        default kengplsz@gmail.com
 *   OWNER_TENANT_SLUG  default demo
 *   OWNER_PASSWORD     optional — set it to also allow email/password login.
 *                      Leave empty for Google-only sign-in.
 *
 * Run:  npx ts-node-dev --transpile-only src/scripts/setup-owner.ts
 *
 * NOTE: This grants *application* superadmin. To make kengplsz@gmail.com the
 * Firebase/Google-Cloud project **Owner** (IAM), do it in the console — see
 * FIREBASE_SETUP.md. That cannot be done from application code.
 */
async function main() {
  const email = (process.env.OWNER_EMAIL || 'kengplsz@gmail.com').toLowerCase();
  const tenantSlug = process.env.OWNER_TENANT_SLUG || 'demo';
  const password = process.env.OWNER_PASSWORD || undefined;

  console.log(`👑 Setting up owner: ${email} (tenant: ${tenantSlug})`);

  // 1) Ensure tenant exists
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    create: { name: tenantSlug === 'demo' ? 'Happy77 Demo' : tenantSlug, slug: tenantSlug, plan: 'enterprise' },
    update: {},
  });

  // 2) Upsert local superadmin user
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email } },
    create: {
      tenantId: tenant.id,
      email,
      username: email.split('@')[0],
      displayName: 'Owner',
      role: 'superadmin',
      isActive: true,
    },
    update: { role: 'superadmin', isActive: true },
  });
  console.log(`✅ Local user ready: ${user.id} (role: ${user.role})`);

  // 3) Provision Firebase Auth account + custom claims
  if (!isFirebaseEnabled()) {
    console.warn('⚠️  Firebase Admin not configured — skipped Firebase provisioning.');
    console.warn('    Reason:', firebaseInitError());
    console.warn('    Set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_PROJECT_ID) then re-run this script.');
  } else {
    const uid = await provisionFirebaseUser({
      email,
      password,
      displayName: 'Owner',
      claims: { tenantId: tenant.id, role: 'superadmin', userId: user.id },
    });
    if (uid) {
      await prisma.user.update({ where: { id: user.id }, data: { firebaseUid: uid } });
      console.log(`✅ Firebase user ready: ${uid}`);
      console.log(`   Claims: { tenantId: ${tenant.id}, role: superadmin, userId: ${user.id} }`);
      console.log(password ? '   Login: Google OR email/password' : '   Login: Google only (no password set)');
    }
  }

  console.log('\n🎉 Done. Remember to set IAM "Owner" for this email in the Firebase/GCP console (see FIREBASE_SETUP.md).');
}

main()
  .catch((e) => { console.error('❌ setup-owner failed:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); process.exit(); });
