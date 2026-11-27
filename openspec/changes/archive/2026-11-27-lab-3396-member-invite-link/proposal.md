# Proposal

## Why

Members need one personal link to invite people to LabOS (LAB-3396, frontend LAB-3398). This first change gives the link. Sign-up credit waits for LAB-3386.

## What Changes

- New `GET /v1/members/me/invite-link` (member session): returns `{ inviteCode, inviteUrl }`.
- New table `MemberInviteCode`: one unique, reusable code per member. Additive migration only.
- Out of scope: sign-up credit, link-open counts, points, events, guard, env, cookie or token changes.

## Capabilities

### New Capabilities

- `member-invites`: the member's own invite link.

## Impact

- Code: `apps/web-api/src/member-invites/*`, `app.module.ts`, `libs/contracts/src/{lib/contract-member-invite,schema/member-invite}.ts`, `prisma/schema.prisma`, migration `20261127120000_member_invite_code`.
- Guards: the existing `UserTokenValidation`, unchanged.
