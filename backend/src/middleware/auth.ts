import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { adminAuth, isFirebaseEnabled } from '../lib/firebase-admin';
import { setFirebaseUserClaims } from '../lib/firebase-users';

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  username: string;
  role: string;
  displayName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantId?: string;
      authProvider?: 'firebase' | 'legacy';
    }
  }
}

// Allow the old JWT login to keep working during the migration. Set
// ALLOW_LEGACY_JWT=false once everyone signs in through Firebase.
const ALLOW_LEGACY_JWT = process.env.ALLOW_LEGACY_JWT !== 'false';

// The legacy path must never run with the public example secrets — that would let
// anyone forge a token. Refuse the placeholder values outright.
const PLACEHOLDER_JWT_SECRET = 'your-super-secret-jwt-key-change-in-production';
const PLACEHOLDER_REFRESH_SECRET = 'your-super-secret-refresh-key-change-in-production';

function legacyJwtSecret(): string | null {
  const s = process.env.JWT_SECRET;
  if (!ALLOW_LEGACY_JWT || !s || s === PLACEHOLDER_JWT_SECRET) return null;
  return s;
}

export function legacyJwtEnabled(): boolean {
  if (legacyJwtSecret() === null) return false;
  // The refresh secret must ALSO be real — otherwise an attacker forges a refresh
  // token with the public placeholder and mints access tokens via /auth/refresh.
  const r = process.env.JWT_REFRESH_SECRET;
  if (!r || r === PLACEHOLDER_REFRESH_SECRET) return false;
  return true;
}

function pickAuthUser(u: {
  id: string; tenantId: string; email: string; username: string; role: string; displayName: string;
}): AuthUser {
  return {
    id: u.id, tenantId: u.tenantId, email: u.email,
    username: u.username, role: u.role, displayName: u.displayName,
  };
}

const USER_SELECT = {
  id: true, tenantId: true, email: true, username: true,
  role: true, displayName: true, isActive: true, firebaseUid: true,
} as const;

type SelectedUser = {
  id: string; tenantId: string; email: string; username: string;
  role: string; displayName: string; isActive: boolean; firebaseUid: string | null;
};

/**
 * Resolve a verified Firebase ID token to a local user.
 * Returns null when no matching, active, provisioned user exists — which is how
 * we enforce "accounts can only be created inside Firebase + by an admin".
 */
async function resolveFirebaseUser(token: string): Promise<AuthUser | null> {
  const decoded = await adminAuth().verifyIdToken(token);
  const uid = decoded.uid;
  const email = decoded.email ? decoded.email.trim().toLowerCase() : null;
  const emailVerified = decoded.email_verified === true;
  // Custom claims can ONLY be set by our Admin SDK (provisioning), so they are
  // trustworthy — but we still cross-check them against the DB below.
  const claimUserId = (decoded as any).userId as string | undefined;
  const claimTenantId = (decoded as any).tenantId as string | undefined;

  // ── Path 1: trusted custom claim → local user id ──────────────────────────
  if (claimUserId) {
    const u = await prisma.user.findUnique({ where: { id: claimUserId }, select: USER_SELECT });
    // Only honor the claim if it is internally consistent: active, same tenant,
    // and either unlinked or already linked to THIS Firebase uid (never someone else's).
    if (u && u.isActive
      && (!claimTenantId || u.tenantId === claimTenantId)
      && (u.firebaseUid === uid || u.firebaseUid === null)) {
      if (u.firebaseUid === null) {
        await prisma.user.update({ where: { id: u.id }, data: { firebaseUid: uid } }).catch(() => {});
      }
      return pickAuthUser(u);
    }
    // Inconsistent claim → don't trust it, fall through to the strong binding.
  }

  // ── Path 2: strong binding by Firebase uid (set by us at provisioning) ─────
  const linked = await prisma.user.findUnique({ where: { firebaseUid: uid }, select: USER_SELECT });
  if (linked && linked.isActive) return pickAuthUser(linked);

  // ── Path 3: (re)link by VERIFIED email only ───────────────────────────────
  // SECURITY: never resolve on an unverified/spoofable email. Email is NOT
  // globally unique (per-tenant), so require an UNAMBIGUOUS, active match —
  // otherwise deny rather than guess a tenant. We do NOT require firebaseUid to be
  // null: a re-created Firebase account leaves a stale uid on the row, and a single
  // verified-email match is safe to re-link (the email owner proved control).
  if (email && emailVerified) {
    const matches = await prisma.user.findMany({
      where: {
        email,
        isActive: true,
        ...(claimTenantId ? { tenantId: claimTenantId } : {}),
      },
      select: USER_SELECT,
    });
    if (matches.length === 1) {
      const u = matches[0];
      if (u.firebaseUid !== uid) {
        await prisma.user.update({ where: { id: u.id }, data: { firebaseUid: uid } }).catch(() => {});
      }
      // Stamp claims so this account is "owned" by the tenant and can never be
      // adopted/overwritten by another tenant's provisioning (closes the
      // claim-less-account takeover path).
      await setFirebaseUserClaims(uid, { tenantId: u.tenantId, role: u.role, userId: u.id }).catch(() => {});
      return pickAuthUser(u);
    }
    // 0 matches → not provisioned;  >1 → ambiguous across tenants → deny.
  }

  return null;
}

async function resolveLegacyUser(token: string): Promise<AuthUser | null> {
  const secret = legacyJwtSecret();
  if (!secret) return null;
  const decoded = jwt.verify(token, secret) as { id: string };
  const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: USER_SELECT });
  if (!user || !user.isActive) return null;
  return pickAuthUser(user);
}

/**
 * Verify a bearer token from either Firebase or the legacy JWT system.
 * Tries Firebase first (the new default), then legacy. Returns the provider too
 * so callers can log/telemeter the migration.
 */
export async function verifyAuthToken(
  token: string
): Promise<{ user: AuthUser; provider: 'firebase' | 'legacy' } | null> {
  // Firebase ID token
  if (isFirebaseEnabled()) {
    try {
      const user = await resolveFirebaseUser(token);
      if (user) return { user, provider: 'firebase' };
    } catch {
      // not a (valid) Firebase token — fall through to legacy
    }
  }
  // Legacy JWT
  try {
    const user = await resolveLegacyUser(token);
    if (user) return { user, provider: 'legacy' };
  } catch {
    // invalid legacy token
  }
  return null;
}

function extractBearer(authHeader?: string): string | null {
  if (!authHeader) return null;
  let token = authHeader.trim();
  // Tolerate a duplicated "Bearer Bearer <token>" prefix seen in the wild.
  while (token.startsWith('Bearer ')) token = token.slice(7).trim();
  return token || null;
}

export const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractBearer(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const result = await verifyAuthToken(token);
  if (!result) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token, or user not provisioned' });
  }

  req.user = result.user;
  req.tenantId = result.user.tenantId;
  req.authProvider = result.provider;
  return next();
};

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    return next();
  };
};
