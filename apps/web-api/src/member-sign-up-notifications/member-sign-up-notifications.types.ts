import { Prisma } from '@prisma/client';
import { SIGN_UP_EVENTS, SIGN_UP_MEMBER_SELECT } from './member-sign-up-notifications.constants';

export type SignUpEvent = keyof typeof SIGN_UP_EVENTS;

export type SignUpMember = Prisma.MemberGetPayload<{ select: typeof SIGN_UP_MEMBER_SELECT }>;
