# Member Roles System

This document describes the member role system used in the application.

## Overview

The system uses a multi-tier role architecture:

1. **Member-level roles** (`MemberRole` table) - Global permissions across the system
2. **Demo Day admin scopes** (`MemberDemoDayAdminScope` table) - Host-based permissions for demo day admins
3. **Context-specific flags** (`DemoDayParticipant.isDemoDayAdmin`) - Per-resource permissions

## Member Roles Enum

Defined in:
- `apps/web-api/src/utils/constants.ts`
- `apps/back-office/utils/constants.ts`

```typescript
export enum MemberRole {
  DIRECTORY_ADMIN = 'DIRECTORYADMIN',  // Full system administration (super role)
  DEMO_DAY_ADMIN = 'DEMO_DAY_ADMIN',   // Demo day administration (scoped by host)
}
```

## Role Hierarchy

| Role | Scope | Access Level |
|------|-------|--------------|
| `DIRECTORY_ADMIN` | Global | Full system access - can manage everything including all demo days |
| `DEMO_DAY_ADMIN` | Host-scoped | Admin access to demo days matching their `MemberDemoDayAdminScope.scopeValue` |
| `isDemoDayAdmin` flag | Per Demo Day | Admin access to a SPECIFIC demo day only |

## Role Descriptions

### DIRECTORY_ADMIN

- **Enum Key**: `MemberRole.DIRECTORY_ADMIN`
- **Database Value**: `'DIRECTORYADMIN'`
- **Scope**: System-wide
- **Permissions**:
  - Full access to all back-office features
  - Can manage all demo days regardless of host
  - Can manage members, teams, projects
  - Can assign roles to other members
  - Can soft-delete teams

### DEMO_DAY_ADMIN

- **Enum Key**: `MemberRole.DEMO_DAY_ADMIN`
- **Database Value**: `'DEMO_DAY_ADMIN'`
- **Scope**: Host-based (via `MemberDemoDayAdminScope`)
- **Permissions**:
  - Can access back-office (via OTP login)
  - Admin access to demo days where `DemoDay.host` matches their `MemberDemoDayAdminScope.scopeValue`
  - Can manage demo day participants, teams, settings for scoped demo days

### isDemoDayAdmin (Participant Flag)

- **Location**: `DemoDayParticipant.isDemoDayAdmin` field
- **Scope**: Single demo day
- **Permissions**:
  - Admin access to the specific demo day they are assigned to
  - Cannot access back-office directly (unless they also have a MemberRole)

## Demo Day Admin Scopes

The `MemberDemoDayAdminScope` table provides host-based scoping for `DEMO_DAY_ADMIN` users:

```prisma
model MemberDemoDayAdminScope {
  id         Int                   @id @default(autoincrement())
  memberUid  String
  scopeType  DemoDayAdminScopeType // Currently only 'HOST'
  scopeValue String                // e.g. "plnetwork.io", "protocol.ai"
  config     Json?                 // optional extra config

  member Member @relation(fields: [memberUid], references: [uid], onDelete: Cascade)

  @@unique([memberUid, scopeType, scopeValue])
}

enum DemoDayAdminScopeType {
  HOST // host-based permissions (e.g. "plnetwork.io")
}
```

### How Host Scoping Works

1. Each `DemoDay` has a `host` field (e.g., `"plnetwork.io"`, `"protocol.ai"`)
2. A `DEMO_DAY_ADMIN` member can have multiple `MemberDemoDayAdminScope` entries
3. When accessing demo days, the system checks if `MemberDemoDayAdminScope.scopeValue` matches `DemoDay.host`

**Example**: A member with `DEMO_DAY_ADMIN` role and scope `scopeValue: "protocol.ai"` can only view and edit demo days where `DemoDay.host = "protocol.ai"`.

## How Access is Determined

### Back-Office Login Access

A member can log into the back-office if they have ANY of these roles:
- `DIRECTORY_ADMIN`
- `DEMO_DAY_ADMIN`

```typescript
const backofficeRoles = [MemberRole.DIRECTORY_ADMIN, MemberRole.DEMO_DAY_ADMIN];
const hasBackofficeAccess = hasAnyAdminRole(member, backofficeRoles);
```

### Demo Day Admin Access (checkDemoDayAccess)

Access is checked in the following order:

1. **Directory Admin**: Full access to all demo days
2. **Demo Day Admin with Host Scope**: Access if `MemberDemoDayAdminScope.scopeValue` matches `DemoDay.host`
3. **Participant-level Admin**: Access if `DemoDayParticipant.isDemoDayAdmin` is true
4. **Regular Participant**: Read-only access if they are an enabled participant

```typescript
// From demo-days.service.ts checkDemoDayAccess method:

// 1) Directory admins always have full access
if (isDirectoryAdmin) {
  return { participantUid: member.uid, isAdmin: true };
}

// 2) Demo day admin with host-level scope
if (hasDemoDayAdminRole) {
  const hostScopes = await prisma.memberDemoDayAdminScope.findMany({
    where: { memberUid: member.uid, scopeType: 'HOST' },
  });
  const allowedHosts = hostScopes.map((s) => s.scopeValue.toLowerCase());

  if (allowedHosts.includes(demoDay.host.toLowerCase())) {
    return { participantUid: member.uid, isAdmin: true };
  }
}

// 3) Participant-level demo day admin
if (participant?.isDemoDayAdmin) {
  return { participantUid: member.uid, isAdmin: true };
}

// 4) Regular participant access
// ...
```

### Demo Days List for Admin (getAllDemoDaysForAdmin)

```typescript
// DIRECTORY_ADMIN sees all demo days
if (isDirectoryAdmin) {
  return getAllDemoDays();
}

// DEMO_DAY_ADMIN sees only demo days matching their host scopes
const adminScopes = await prisma.memberDemoDayAdminScope.findMany({
  where: { memberUid, scopeType: 'HOST' },
});
const allowedHosts = adminScopes.map((scope) => scope.scopeValue);

return prisma.demoDay.findMany({
  where: { host: { in: allowedHosts } },
});
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
  memberRoles        MemberRole[]
  demoDayAdminScopes MemberDemoDayAdminScope[]
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

### DemoDay (Host field)

```prisma
model DemoDay {
  // ...
  host String @default("plnetwork.io")  // Used for scoping DEMO_DAY_ADMIN access
  // ...
}
```

## Usage Examples

### Assign DIRECTORY_ADMIN Role to a Member

```typescript
// First, ensure the role exists
const directoryAdminRole = await prisma.memberRole.findUnique({
  where: { name: MemberRole.DIRECTORY_ADMIN }, // 'DIRECTORYADMIN'
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

### Assign DEMO_DAY_ADMIN Role with Host Scope

```typescript
// 1. Assign the DEMO_DAY_ADMIN role to the member
const demoDayAdminRole = await prisma.memberRole.findUnique({
  where: { name: MemberRole.DEMO_DAY_ADMIN },
});

await prisma.member.update({
  where: { uid: memberUid },
  data: {
    memberRoles: {
      connect: { id: demoDayAdminRole.id },
    },
  },
});

// 2. Create the host scope for the member
await prisma.memberDemoDayAdminScope.create({
  data: {
    memberUid: memberUid,
    scopeType: 'HOST',
    scopeValue: 'protocol.ai', // This admin can manage demo days with host = 'protocol.ai'
  },
});
```

### Assign Multiple Host Scopes to a DEMO_DAY_ADMIN

```typescript
// A single DEMO_DAY_ADMIN can manage multiple hosts
await prisma.memberDemoDayAdminScope.createMany({
  data: [
    { memberUid, scopeType: 'HOST', scopeValue: 'protocol.ai' },
    { memberUid, scopeType: 'HOST', scopeValue: 'filecoin.io' },
  ],
});
```

### Assign Admin for a Specific Demo Day (Participant-level)

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

### Check if Member Has Admin Access

```typescript
import { isDirectoryAdmin, hasDemoDayAdminRole, hasAnyAdminRole, MemberRole } from '../utils/constants';

// Check for directory admin (super role)
if (isDirectoryAdmin(member)) {
  // Full system access
}

// Check for demo day admin role (still needs host scope check for specific demo day)
if (hasDemoDayAdminRole(member)) {
  // Has DEMO_DAY_ADMIN role, but check host scopes for specific demo day access
}

// Check for back-office access
const backofficeRoles = [MemberRole.DIRECTORY_ADMIN, MemberRole.DEMO_DAY_ADMIN];
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
| `hasDemoDayAdminRole(member)` | Check if member has DEMO_DAY_ADMIN role |

## Seeding Roles

The roles are seeded via the fixture file at `apps/web-api/prisma/fixtures/member-roles.ts`:

```typescript
export const memberRoles = [MemberRole.DIRECTORY_ADMIN, MemberRole.DEMO_DAY_ADMIN].map((role) =>
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
