import type { ModuleKey, UserProfile, UserRole } from '../lib/types';

export const ROLE_LABELS: Record<UserRole, string> = {
  MASTER_ADMIN: 'Master Administrador',
  OPERATIONAL_ADMIN: 'Administrador Operacional',
  MEMBER: 'Integrante',
  VIEWER: 'Visualização',
};

export function isMaster(user: UserProfile | null): boolean {
  return Boolean(user && user.status === 'ACTIVE' && user.role === 'MASTER_ADMIN');
}

export function isOpOrMaster(user: UserProfile | null): boolean {
  return Boolean(
    user &&
      user.status === 'ACTIVE' &&
      (user.role === 'MASTER_ADMIN' || user.role === 'OPERATIONAL_ADMIN')
  );
}

export function canAccessModule(user: UserProfile | null, moduleKey: ModuleKey): boolean {
  if (!user || user.status !== 'ACTIVE') return false;
  if (user.role === 'MASTER_ADMIN') return true;
  if (moduleKey === 'settings') return user.permissions?.settings === true;
  return user.permissions?.[moduleKey] !== false;
}

export function canWriteOperationally(user: UserProfile | null): boolean {
  if (!user || user.status !== 'ACTIVE') return false;
  return user.role !== 'VIEWER';
}

export function canDelete(user: UserProfile | null): boolean {
  if (!user || user.status !== 'ACTIVE') return false;
  return user.role === 'MASTER_ADMIN' || user.permissions?.canDeleteRecords === true;
}

export function canApproveQuote(user: UserProfile | null): boolean {
  if (!user || user.status !== 'ACTIVE') return false;
  return (
    user.role === 'MASTER_ADMIN' ||
    user.role === 'OPERATIONAL_ADMIN' ||
    user.permissions?.canApproveQuotes === true
  );
}
