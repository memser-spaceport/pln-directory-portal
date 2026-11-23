import { IntroRequestType } from '@prisma/client';
import { directoryUrl } from '../utils/directory-url';
import { telegramLink } from '../utils/telegram/telegram-link';
import { escapeTelegramHtml } from '../utils/telegram/escape-telegram-html';

const TYPE_LABEL: Record<IntroRequestType, string> = {
  MEMBER: 'intro to member',
  TEAM: 'intro to team',
};

export function requesterTeamLabel(roles: { mainTeam: boolean; teamName: string }[], plInfra: boolean): string {
  const names = [...roles]
    .sort((a, b) => Number(b.mainTeam) - Number(a.mainTeam) || a.teamName.localeCompare(b.teamName))
    .map((role) => role.teamName);
  const unique = [...new Set(names)];
  if (unique.length > 0) {
    return unique.join(', ');
  }
  if (plInfra) {
    return 'PL Infra';
  }
  return '-';
}

export function introRequestTelegramText(input: {
  requesterName: string;
  requesterUid: string;
  teamLabel: string;
  type: IntroRequestType;
  targetName: string;
  targetUid: string;
  text: string;
}): string {
  const targetPath = input.type === 'MEMBER' ? `/members/${input.targetUid}` : `/teams/${input.targetUid}`;
  return [
    'Intro request',
    `Requester: ${telegramLink(directoryUrl(`/members/${input.requesterUid}`), input.requesterName)}`,
    `Team: ${escapeTelegramHtml(input.teamLabel)}`,
    `Type: ${TYPE_LABEL[input.type]}`,
    `Target: ${telegramLink(directoryUrl(targetPath), input.targetName)}`,
    `Text: ${escapeTelegramHtml(input.text)}`,
  ].join('\n');
}
