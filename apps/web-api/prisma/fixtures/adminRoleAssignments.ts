/**
 * Admin role assignments for Demo Day Admins and Directory Admin.
 */

export interface AdminRoleAssignment {
  memberUid: string;
  roleName: string;
}

// Declarative list of assignments.
// seed.ts will convert this into INSERT statements.
export const adminRoleAssignments: AdminRoleAssignment[] = [
  {
    memberUid: 'demo-admin-uid-001',
    roleName: 'DEMO_DAY_ADMIN',
  },
  {
    memberUid: 'demo-admin-uid-002',
    roleName: 'DEMO_DAY_ADMIN',
  },
  {
    memberUid: 'uid-directoryadmin',
    roleName: 'DIRECTORYADMIN',
  },
];
