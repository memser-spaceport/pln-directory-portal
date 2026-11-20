import { directoryUrl } from '../utils/directory-url';
import { normalizeExternalLinkedinUrl } from '../utils/linkedin-profile-url';
import { telegramLink } from '../utils/telegram/telegram-link';
import { escapeTelegramHtml } from '../utils/telegram/escape-telegram-html';
import { JOB_ASPIRANT_TAG, SIGN_UP_EVENTS } from './member-sign-up-notifications.constants';
import type { SignUpEvent, SignUpMember } from './member-sign-up-notifications.types';

export function memberSignUpTelegramText(event: SignUpEvent, member: SignUpMember): string {
  const isJobAspirant = member.policyAssignmentsV2.length > 0;
  const jobSearchLine = isJobAspirant ? [`Job search: ${plain(member.jobSearchStatus)}`] : [];
  return [
    headline(event, isJobAspirant),
    `Name: ${telegramLink(directoryUrl(`/members/${member.uid}`), member.name)}`,
    `Email: ${plain(member.email)}`,
    `Team: ${plain(teamNames(member))}`,
    `Role: ${plain(member.role)}`,
    ...jobSearchLine,
    `LinkedIn: ${linkedinLink(member.linkedinHandler)}`,
    `Source: ${plain(signUpSource(member))}`,
    telegramLink(backOfficeUrl(event, member), 'Open in back office'),
  ].join('\n');
}

function headline(event: SignUpEvent, isJobAspirant: boolean): string {
  const { headline, tagsJobAspirant } = SIGN_UP_EVENTS[event];
  return tagsJobAspirant && isJobAspirant ? `${headline} · ${JOB_ASPIRANT_TAG}` : headline;
}

function plain(value: string | null): string {
  return value ? escapeTelegramHtml(value) : '-';
}

function teamNames(member: SignUpMember): string {
  return [...member.teamMemberRoles]
    .sort((a, b) => Number(b.mainTeam) - Number(a.mainTeam))
    .map((role) => role.team.name)
    .join(', ');
}

function linkedinLink(handler: string | null): string {
  return handler ? telegramLink(normalizeExternalLinkedinUrl(handler), handler) : '-';
}

function signUpSource(member: SignUpMember): string {
  return [member.signUpSource, member.signUpMedium, member.signUpCampaign].filter(Boolean).join(' / ');
}

function backOfficeUrl(event: SignUpEvent, member: SignUpMember): string {
  const base = (process.env.WEB_ADMIN_UI_BASE_URL ?? '').replace(/\/+$/, '');
  const search = encodeURIComponent(member.email ?? member.name);
  return `${base}/members?filter=${SIGN_UP_EVENTS[event].backOfficeFilter}&search=${search}`;
}
