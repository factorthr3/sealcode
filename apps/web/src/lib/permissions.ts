import type { Role } from '@sealcode/db';

export type Permission =
  | 'keys.manage_all'
  | 'members.manage'
  | 'budgets.manage'
  | 'audit.view'
  | 'usage.view_all'
  | 'billing.view'
  | 'org.settings';

const GRANTS: Record<Role, Permission[]> = {
  owner: [
    'keys.manage_all',
    'members.manage',
    'budgets.manage',
    'audit.view',
    'usage.view_all',
    'billing.view',
    'org.settings',
  ],
  admin: [
    'keys.manage_all',
    'members.manage',
    'budgets.manage',
    'audit.view',
    'usage.view_all',
    'billing.view',
    'org.settings',
  ],
  billing: ['usage.view_all', 'billing.view'],
  developer: [],
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

/** Owners and admins must use two-factor login (brief: security requirements). */
export function roleRequiresMfa(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Developer',
  billing: 'Billing',
};
