/**
 * Demo Day Admin → DEMO_DAY_ADMIN role assignments.
 */

export interface DemoDayAdminRoleAssignment {
  memberUid: string;
  roleName: string;
}

// Declarative list of assignments.
// seed.ts will convert this into INSERT statements.
export const demoDayAdminRoleAssignments: DemoDayAdminRoleAssignment[] = [
  {
    memberUid: 'demo-admin-uid-001',
    roleName: 'DEMO_DAY_ADMIN',
  },
  {
    memberUid: 'demo-admin-uid-002',
    roleName: 'DEMO_DAY_ADMIN',
  },
];
