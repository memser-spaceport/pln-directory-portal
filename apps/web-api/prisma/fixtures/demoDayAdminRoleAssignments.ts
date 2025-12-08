/**
 * Demo Day Admin → DEMO_DAY_ADMIN role assignments.
 *
 * ⚠ IMPORTANT:
 * Prisma does NOT allow CreateMany on join tables created by Many-to-Many relations.
 * Therefore, this fixture only describes the intended assignments.
 *
 * The seed.ts script must read these fixtures and insert the relation rows
 * into the join-table "_MemberToMemberRole" using raw SQL.
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
