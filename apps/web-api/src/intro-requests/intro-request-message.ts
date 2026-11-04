import { IntroRequestType } from '@prisma/client';

const TYPE_LABEL: Record<IntroRequestType, string> = {
  MEMBER: 'intro to member',
  TEAM: 'intro to team',
};

export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function telegramLink(url: string, label: string): string {
  const href = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<a href="${href}">${escapeTelegramHtml(label)}</a>`;
}

export function directoryUrl(path: string): string {
  const base = (process.env.WEB_UI_BASE_URL ?? '').replace(/\/+$/, '');
  return `${base}${path}`;
}

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
