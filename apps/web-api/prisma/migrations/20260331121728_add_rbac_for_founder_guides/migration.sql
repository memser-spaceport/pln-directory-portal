-- RBAC core tables

create table if not exists "Role"
(
  "uid"         text primary key,
  "code"        text         not null unique,
  "name"        text         not null,
  "description" text,
  "createdAt"   timestamp(3) not null default current_timestamp,
  "updatedAt"   timestamp(3) not null
);

create table if not exists "Permission"
(
  "uid"         text primary key,
  "code"        text         not null unique,
  "description" text,
  "createdAt"   timestamp(3) not null default current_timestamp,
  "updatedAt"   timestamp(3) not null
);

create table if not exists "RolePermission"
(
  "roleUid"       text         not null,
  "permissionUid" text         not null,
  "createdAt"     timestamp(3) not null default current_timestamp,
  primary key ("roleUid", "permissionUid"),
  constraint "RolePermission_roleUid_fkey"
    foreign key ("roleUid") references "Role" ("uid")
      on delete restrict on update cascade,
  constraint "RolePermission_permissionUid_fkey"
    foreign key ("permissionUid") references "Permission" ("uid")
      on delete restrict on update cascade
);

create index if not exists "RolePermission_roleUid_idx" on "RolePermission" ("roleUid");
create index if not exists "RolePermission_permissionUid_idx" on "RolePermission" ("permissionUid");

create table if not exists "RoleAssignment"
(
  "uid"                 text primary key,
  "roleUid"             text         not null,
  "memberUid"           text         not null,
  "assignedByMemberUid" text,
  "assignedAt"          timestamp(3) not null default current_timestamp,
  "revokedAt"           timestamp(3),
  "status"              text         not null default 'ACTIVE',
  "createdAt"           timestamp(3) not null default current_timestamp,
  "updatedAt"           timestamp(3) not null,
  constraint "RoleAssignment_roleUid_fkey"
    foreign key ("roleUid") references "Role" ("uid")
      on delete restrict on update cascade,
  constraint "RoleAssignment_memberUid_fkey"
    foreign key ("memberUid") references "Member" ("uid")
      on delete restrict on update cascade,
  constraint "RoleAssignment_assignedByMemberUid_fkey"
    foreign key ("assignedByMemberUid") references "Member" ("uid")
      on delete restrict on update cascade
);

create index if not exists "RoleAssignment_memberUid_idx" on "RoleAssignment" ("memberUid");
create index if not exists "RoleAssignment_roleUid_idx" on "RoleAssignment" ("roleUid");

create table if not exists "MemberPermission"
(
  "uid"                text primary key,
  "memberUid"          text         not null,
  "permissionUid"      text         not null,
  "grantedByMemberUid" text,
  "revokedAt"          timestamp(3),
  "status"             text         not null default 'ACTIVE',
  "createdAt"          timestamp(3) not null default current_timestamp,
  "updatedAt"          timestamp(3) not null,
  constraint "MemberPermission_memberUid_fkey"
    foreign key ("memberUid") references "Member" ("uid")
      on delete restrict on update cascade,
  constraint "MemberPermission_permissionUid_fkey"
    foreign key ("permissionUid") references "Permission" ("uid")
      on delete restrict on update cascade,
  constraint "MemberPermission_grantedByMemberUid_fkey"
    foreign key ("grantedByMemberUid") references "Member" ("uid")
      on delete restrict on update cascade
);

create index if not exists "MemberPermission_memberUid_idx" on "MemberPermission" ("memberUid");
create index if not exists "MemberPermission_permissionUid_idx" on "MemberPermission" ("permissionUid");

-- Seed role + permissions for Founder Guides

insert into "Role" ("uid", "code", "name", "description", "createdAt", "updatedAt")
values ('role_founder_guides_editor',
        'FOUNDER_GUIDES_EDITOR',
        'Founder Guides Editor',
        'Can view and create Founder Guides articles',
        now(),
        now())
on conflict ("code") do nothing;

insert into "Permission" ("uid", "code", "description", "createdAt", "updatedAt")
values ('perm_founder_guides_view',
        'founder_guides.view',
        'Can view Founder Guides',
        now(),
        now()),
       ('perm_founder_guides.create',
        'founder_guides.create',
        'Can create Founder Guides',
        now(),
        now())
on conflict ("code") do nothing;

insert into "RolePermission" ("roleUid", "permissionUid", "createdAt")
values ('role_founder_guides_editor', 'perm_founder_guides_view', now()),
       ('role_founder_guides_editor', 'perm_founder_guides.create', now())
on conflict do nothing;
