import { adminAuth, isFirebaseEnabled } from './firebase-admin';
import prisma from './prisma';

function crossTenantError(): Error {
  const e: any = new Error('อีเมลนี้ถูกใช้งานในองค์กร (tenant) อื่นแล้ว — Firebase ใช้อีเมลร่วมกันทั้งระบบ');
  e.code = 'cross-tenant-email';
  return e;
}

/**
 * Helpers for keeping Firebase Auth in sync with the local `User` table.
 *
 * Design rule (per product requirement): user accounts can only be created
 * inside Firebase. Admins create users through the CRM, which provisions them
 * here; there is no public self-signup. Roles + tenant are stored as Firebase
 * custom claims so they ride along inside the ID token.
 */

export interface UserClaims {
  tenantId: string;
  role: string;
  userId: string;
}

/**
 * Create (or adopt an existing) Firebase Auth user for the given email and set
 * its custom claims. Returns the Firebase UID, or null when Firebase is not
 * configured (so callers can degrade gracefully before setup is finished).
 */
export async function provisionFirebaseUser(opts: {
  email: string;
  password?: string;
  displayName?: string;
  claims: UserClaims;
}): Promise<string | null> {
  if (!isFirebaseEnabled()) return null;
  const auth = adminAuth();

  let uid: string;
  try {
    const existing = await auth.getUserByEmail(opts.email);
    uid = existing.uid;

    // SECURITY: Firebase emails are GLOBAL, but our users are per-tenant. Refuse to
    // adopt a Firebase account that belongs to a DIFFERENT tenant — established by
    // EITHER its existing tenant claim OR an existing local link. Otherwise an admin
    // of tenant B could overwrite tenant A's account (claims/credential).
    const existingTenant = (existing.customClaims as any)?.tenantId as string | undefined;
    if (existingTenant && existingTenant !== opts.claims.tenantId) throw crossTenantError();

    const linkedLocal = await prisma.user.findUnique({
      where: { firebaseUid: uid },
      select: { tenantId: true },
    });
    if (linkedLocal && linkedLocal.tenantId !== opts.claims.tenantId) throw crossTenantError();

    // Adopt WITHOUT ever resetting the password — that would let an admin take over
    // a pre-existing (e.g. personal Google) account's credential. Only sync displayName.
    if (opts.displayName) await auth.updateUser(uid, { displayName: opts.displayName });
  } catch (err: any) {
    if (err.code === 'cross-tenant-email') throw err;
    if (err.code === 'auth/user-not-found') {
      // Brand-new account — safe to set the initial password (and createUser
      // accepts none for Google-only users).
      const created = await auth.createUser({
        email: opts.email,
        password: opts.password || undefined,
        displayName: opts.displayName,
        emailVerified: false,
      });
      uid = created.uid;
    } else {
      throw err;
    }
  }

  await auth.setCustomUserClaims(uid, { ...opts.claims });
  return uid;
}

export async function setFirebaseUserClaims(uid: string, claims: UserClaims): Promise<void> {
  if (!isFirebaseEnabled()) return;
  await adminAuth().setCustomUserClaims(uid, { ...claims });
}

export async function setFirebasePassword(uid: string, password: string): Promise<void> {
  if (!isFirebaseEnabled()) return;
  await adminAuth().updateUser(uid, { password });
}

export async function setFirebaseUserDisabled(uid: string, disabled: boolean): Promise<void> {
  if (!isFirebaseEnabled()) return;
  await adminAuth().updateUser(uid, { disabled });
}

export async function deleteFirebaseUser(uid: string): Promise<void> {
  if (!isFirebaseEnabled()) return;
  await adminAuth().deleteUser(uid).catch(() => {});
}
