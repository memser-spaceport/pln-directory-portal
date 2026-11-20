import { Prisma } from '@prisma/client';
import { JOB_ASPIRANT_POLICY_CODE } from '../access-control-v2/access-control-v2.constants';

export const SIGN_UP_MEMBER_SELECT = Prisma.validator<Prisma.MemberSelect>()({
  uid: true,
  name: true,
  email: true,
  role: true,
  linkedinHandler: true,
  signUpSource: true,
  signUpMedium: true,
  signUpCampaign: true,
  jobSearchStatus: true,
  teamMemberRoles: { select: { mainTeam: true, team: { select: { name: true } } } },
  policyAssignmentsV2: { where: { policy: { code: JOB_ASPIRANT_POLICY_CODE } }, select: { uid: true } },
});

/* `backOfficeFilter` is the back-office members tab the member lands in after the event:
   a new sign-up is PENDING (`level0`), a LinkedIn verification moves it to VERIFIED (`level1`). */
export const SIGN_UP_EVENTS = {
  SIGN_UP: {
    channelType: 'SIGN_UP_AND_VERIFIED',
    headline: '🆕 New sign-up',
    backOfficeFilter: 'level0',
    tagsJobAspirant: true,
  },
  LINKEDIN_VERIFIED: {
    channelType: 'SIGN_UP_AND_VERIFIED',
    headline: '✅ LinkedIn verified',
    backOfficeFilter: 'level1',
    tagsJobAspirant: true,
  },
  JOB_ASPIRANT_SIGN_UP: {
    channelType: 'JOB_ASPIRANT_SIGN_UP',
    headline: '💼 New Job Aspirant sign-up',
    backOfficeFilter: 'level0',
    tagsJobAspirant: false,
  },
} as const;

export const JOB_ASPIRANT_TAG = '💼 Job Aspirant';
