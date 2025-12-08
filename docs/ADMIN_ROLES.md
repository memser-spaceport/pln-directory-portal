# Admin Roles System

This document describes the admin role system used in the back-office application.

## Overview

The system uses a two-tier role architecture:

1. **Member-level roles** (`MemberRole` table) - Global permissions across the system
2. **Context-specific flags** (`DemoDayParticipant.isDemoDayAdmin`) - Per-resource permissions

## Admin Roles Enum

Defined in `apps/web-api/src/utils/constants.ts`:

```typescript
export enum AdminRole {
  DIRECTORY_ADMIN = 'DIRECTORYADMIN',  // Full system administration (super role)
  DEMO_DAY_ADMIN = 'DEMO_DAY_ADMIN',   // Global demo day administration
}
```

## Role Hierarchy

| Role | Scope | Access Level |
|------|-------|--------------|
| `DIRECTORY_ADMIN` | Global | Full system access - can manage everything including all demo days |
| `DEMO_DAY_ADMIN` | Global | Admin access to ALL demo days |
| `isDemoDayAdmin` flag | Per Demo Day | Admin access to a SPECIFIC demo day only |

## Role Descriptions

### DIRECTORY_ADMIN

- **Enum Key**: `AdminRole.DIRECTORY_ADMIN`
- **Database Value**: `'DIRECTORYADMIN'`
- **Scope**: System-wide
- **Permissions**:
  - Full access to all back-office features
  - Can manage all demo days
  - Can manage members, teams, projects
  - Can assign roles to other members
  - Can soft-delete teams

### DEMO_DAY_ADMIN

- **Enum Key**: `AdminRole.DEMO_DAY_ADMIN`
- **Database Value**: `'DEMO_DAY_ADMIN'`
- **Scope**: All demo days
- **Permissions**:
  - Can access back-office (via OTP login)
  - Admin access to ALL demo days
  - Can manage demo day participants, teams, settings

### isDemoDayAdmin (Participant Flag)

- **Location**: `DemoDayParticipant.isDemoDayAdmin` field
- **Scope**: Single demo day
- **Permissions**:
  - Admin access to the specific demo day they are assigned to
  - Cannot access back-office directly (unless they also have a MemberRole)

## How Access is Determined

### Back-Office Login Access

A member can log into the back-office if they have ANY of these roles:
- `DIRECTORY_ADMIN`
- `DEMO_DAY_ADMIN`

```typescript
const backofficeRoles = [AdminRole.DIRECTORY_ADMIN, AdminRole.DEMO_DAY_ADMIN];
const hasBackofficeAccess = hasAnyAdminRole(member, backofficeRoles);
```

### Demo Day Admin Access

A member is considered a demo day admin if ANY of these conditions are true:

```typescript
// Member-level check (global access)
const hasMemberLevelAdminAccess = isDirectoryAdmin(member) || hasDemoDayAdminRole(member);

// Combined with participant-level check (specific demo day)
const isDemoDayAdmin = participant.isDemoDayAdmin || hasMemberLevelAdminAccess;
```

## Database Schema

### MemberRole Table

```prisma
model MemberRole {
  id        Int      @id @default(autoincrement())
  uid       String   @unique @default(cuid())
  name      String   @unique  // 'DIRECTORYADMIN' or 'DEMO_DAY_ADMIN'
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  members   Member[]
}
```

### Member to MemberRole (Many-to-Many)

Members can have multiple roles. The relationship is defined in Prisma schema:

```prisma
model Member {
  // ...
  memberRoles MemberRole[]
  // ...
}
```

### DemoDayParticipant (Per-Demo-Day Admin)

```prisma
model DemoDayParticipant {
  // ...
  isDemoDayAdmin Boolean @default(false)  // Per-demo-day admin flag
  // ...
}
```

## Usage Examples

### Assign DIRECTORY_ADMIN Role to a Member

```typescript
// First, ensure the role exists
const directoryAdminRole = await prisma.memberRole.findUnique({
  where: { name: AdminRole.DIRECTORY_ADMIN }, // 'DIRECTORYADMIN'
});

// Connect the role to the member
await prisma.member.update({
  where: { uid: memberUid },
  data: {
    memberRoles: {
      connect: { id: directoryAdminRole.id },
    },
  },
});
```

### Assign DEMO_DAY_ADMIN Role (Global Demo Day Access)

```typescript
const demoDayAdminRole = await prisma.memberRole.findUnique({
  where: { name: AdminRole.DEMO_DAY_ADMIN },
});

await prisma.member.update({
  where: { uid: memberUid },
  data: {
    memberRoles: {
      connect: { id: demoDayAdminRole.id },
    },
  },
});
```

### Assign Admin for a Specific Demo Day

```typescript
await prisma.demoDayParticipant.upsert({
  where: {
    demoDayUid_memberUid: {
      demoDayUid: demoDayUid,
      memberUid: memberUid,
    },
  },
  create: {
    demoDayUid: demoDayUid,
    memberUid: memberUid,
    type: 'SUPPORT',
    status: 'ENABLED',
    isDemoDayAdmin: true,
  },
  update: {
    isDemoDayAdmin: true,
  },
});
```

### Remove Admin from a Specific Demo Day

```typescript
await prisma.demoDayParticipant.update({
  where: {
    demoDayUid_memberUid: {
      demoDayUid: demoDayUid,
      memberUid: memberUid,
    },
  },
  data: {
    isDemoDayAdmin: false,
  },
});
```

### Check if Member Has Admin Access

```typescript
import { isDirectoryAdmin, hasDemoDayAdminRole, hasAnyAdminRole, AdminRole } from '../utils/constants';

// Check for directory admin (super role)
if (isDirectoryAdmin(member)) {
  // Full system access
}

// Check for any demo day admin role
if (hasDemoDayAdminRole(member)) {
  // Global demo day access
}

// Check for back-office access
const backofficeRoles = [AdminRole.DIRECTORY_ADMIN, AdminRole.DEMO_DAY_ADMIN];
if (hasAnyAdminRole(member, backofficeRoles)) {
  // Can access back-office
}
```

## Helper Functions

Located in `apps/web-api/src/utils/constants.ts`:

| Function | Description |
|----------|-------------|
| `hasAdminRole(member, role)` | Check if member has a specific admin role |
| `hasAnyAdminRole(member, roles)` | Check if member has any of the specified roles |
| `isDirectoryAdmin(member)` | Check if member is a directory admin (super role) |
| `hasDemoDayAdminRole(member)` | Check if member has global demo day admin role |

## Seeding Roles

The roles are seeded via the fixture file at `apps/web-api/prisma/fixtures/member-roles.ts`:

```typescript
export const memberRoles = [AdminRole.DIRECTORY_ADMIN, AdminRole.DEMO_DAY_ADMIN].map((role) =>
  memberRoleFactory.build({
    uid: faker.helpers.slugify(`uid-${role.toLowerCase()}`),
    name: role,
    // ...
  })
);
```

For production, ensure these roles exist in the `MemberRole` table:

```sql
INSERT INTO "MemberRole" (uid, name, "createdAt", "updatedAt")
VALUES
  ('uid-directoryadmin', 'DIRECTORYADMIN', NOW(), NOW()),
  ('uid-demo-day-admin', 'DEMO_DAY_ADMIN', NOW(), NOW())
ON CONFLICT (name) DO NOTHING;
```
