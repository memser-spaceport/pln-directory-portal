export const INVESTOR_CSV_MAX_PARTICIPANTS = 15000;
export const INVESTOR_CSV_CHUNK_SIZE = 50;
export const INVESTOR_CSV_ITEMS_PER_PAGE = 50;

export type ParsedInvestorParticipant = {
  email: string;
  name: string;
  organization?: string;
  organizationEmail?: string;
  twitterHandler?: string | null;
  linkedinHandler?: string | null;
  telegramHandler?: string | null;
  role?: string | null;
  investmentType?: 'ANGEL' | 'FUND' | 'ANGEL_AND_FUND' | null;
  typicalCheckSize?: number | null;
  investInStartupStages?: string[] | null;
  secRulesAccepted?: boolean | null;
  makeTeamLead?: boolean;
  willBeTeamLead?: boolean;
  errors?: string[];
};

export type InvestorParticipantForApi = Omit<ParsedInvestorParticipant, 'willBeTeamLead' | 'errors'>;

const headerAliases = {
  email: ['email', 'e-mail', 'email_address'],
  name: ['name', 'full_name', 'investor_name', 'participant_name'],
  twitter_handler: ['x', 'x_handle', 'twitter', 'twitter_handle', 'x_username', 'twitter_handler'],
  linkedin_handler: ['linkedin', 'linkedin_handle', 'linkedin_handler', 'linkedin_url', 'linkedin_profile'],
  telegram_handler: ['telegram_handler', 'telegram', 'telegram_handle', 'tg'],
  role: ['role', 'organization_role', 'fund_role', 'organization/fund_role', 'team_role'],
  investment_type: ['type', 'investment_type', 'invest_type', 'investor_type', 'how_do_you_invest'],
  typical_check_size: ['typical_check_size', 'check_size'],
  invest_in_startup_stages: ['investment_stages', 'invest_in_startup_stages'],
  sec_rules_accepted: [
    'sec_rules_accepted',
    't&c',
    't_&_c',
    'terms_and_conditions',
    'terms_&_conditions',
    'terms&conditions',
  ],
  organization: [
    'organization_fund_name',
    'organization/fund_name',
    'organization_/_fund_name',
    'organisation_/_fund_name',
    'organisation/fund_name',
    'organisation_fund_name',
    'org_fund_name',
    'org/fund_name',
    'org_/_fund_name',
    'organization',
    'organization_name',
    'org',
    'org_name',
    'team',
    'team_name',
    'fund',
    'fund_name',
    'company',
  ],
  organization_email: [
    'organization_email',
    'organization_fund_email',
    'organization/fund_email',
    'organization_/_fund_email',
    'org_fund_email',
    'org/fund_email',
    'org_/_fund_email',
    'fund_email',
    'fundemail',
    'org_email',
    'team_email',
    'contact_email',
    'organizationemail',
  ],
  team_lead: ['make_team_lead', 'is_team_lead', 'team_lead', 'lead', 'add_as_team_lead', 'team_lead_flag'],
};

export const normalizeInvestorCsvHeader = (header: string): string => {
  const normalized = header
    .toLowerCase()
    .trim()
    .replace(/[\s-.]/g, '_');

  for (const [field, aliases] of Object.entries(headerAliases)) {
    if (aliases.includes(normalized)) {
      return field;
    }
  }
  return normalized;
};

export const normalizeXHandle = (value: string): string => {
  if (!value) return '';
  const match = value.match(/@?([a-zA-Z0-9_]+)/) || value.match(/x\.com\/([a-zA-Z0-9_]+)/);
  return match ? match[1] : value.trim();
};

export const normalizeLinkedInHandle = (value: string): string => {
  if (!value) return '';
  const match = value.match(/(?:linkedin\.com\/in\/|in\/)([a-zA-Z0-9-]+)/) || value.match(/^([a-zA-Z0-9-]+)$/);
  return match ? match[1] : value.trim();
};

export const parseInvestorCsvBoolean = (value: string): boolean => {
  if (!value) return false;
  const normalized = String(value).toLowerCase().trim();
  return ['true', '1', 'yes', 'y'].includes(normalized);
};

export const normalizeTelegramHandle = (value: string): string => {
  if (!value) return '';
  const match = value.match(/@?([a-zA-Z0-9_]+)/) || value.match(/t\.me\/([a-zA-Z0-9_]+)/);
  return match ? match[1] : value.trim();
};

export const parseInvestmentType = (value: string): 'ANGEL' | 'FUND' | 'ANGEL_AND_FUND' | null => {
  if (!value) return null;
  const normalized = String(value).toLowerCase().trim();

  if (['angel', 'i angel invest', 'angel invest'].includes(normalized)) {
    return 'ANGEL';
  }

  if (['fund', 'i invest through fund(s)', 'i invest thru fund(s)'].includes(normalized)) {
    return 'FUND';
  }

  if (
    [
      'angel_and_fund',
      'angel and fund',
      'angel+fund',
      'i angel invest + invest through fund(s)',
      'i angel invest + i invest thru fund(s)',
    ].includes(normalized)
  ) {
    return 'ANGEL_AND_FUND';
  }

  return null;
};

const parseNumber = (value: string): number | null => {
  if (!value) return null;
  const parsed = parseFloat(String(value).trim());
  return isNaN(parsed) ? null : parsed;
};

const parseArrayFromPipe = (value: string): string[] | null => {
  if (!value) return null;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

export const validateInvestorEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const parseInvestorCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }

  fields.push(current);
  return fields;
};

export const parseInvestorCsv = (
  csvContent: string
): { participants: ParsedInvestorParticipant[]; errors: string[] } => {
  const lines = csvContent.split('\n').filter((line) => line.trim());
  const errors: string[] = [];

  if (lines.length === 0) {
    errors.push('CSV file is empty');
    return { participants: [], errors };
  }

  if (lines.length < 2) {
    errors.push('CSV must contain at least a header row and one data row');
    return { participants: [], errors };
  }

  const rawHeaders = parseInvestorCsvLine(lines[0]).map((h) => h.trim().replace(/"/g, ''));
  const normalizedHeaders = rawHeaders.map(normalizeInvestorCsvHeader);

  const emailIndex = normalizedHeaders.indexOf('email');
  if (emailIndex === -1) {
    errors.push('CSV must contain an "email" column');
    return { participants: [], errors };
  }

  const nameIndex = normalizedHeaders.indexOf('name');
  const organizationIndex = normalizedHeaders.indexOf('organization');
  const organizationEmailIndex = normalizedHeaders.indexOf('organization_email');
  const twitterHandlerIndex = normalizedHeaders.indexOf('twitter_handler');
  const linkedinHandlerIndex = normalizedHeaders.indexOf('linkedin_handler');
  const telegramHandlerIndex = normalizedHeaders.indexOf('telegram_handler');
  const roleIndex = normalizedHeaders.indexOf('role');
  const investmentTypeIndex = normalizedHeaders.indexOf('investment_type');
  const typicalCheckSizeIndex = normalizedHeaders.indexOf('typical_check_size');
  const investInStartupStagesIndex = normalizedHeaders.indexOf('invest_in_startup_stages');
  const secRulesAcceptedIndex = normalizedHeaders.indexOf('sec_rules_accepted');
  const makeTeamLeadIndex = normalizedHeaders.indexOf('team_lead');

  const participants: ParsedInvestorParticipant[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseInvestorCsvLine(lines[i]).map((v) => v.trim().replace(/"/g, ''));
    const rowErrors: string[] = [];

    const email = values[emailIndex]?.trim().toLowerCase() || '';
    if (!email) {
      rowErrors.push('Email is required');
    } else if (!validateInvestorEmail(email)) {
      rowErrors.push('Invalid email format');
    }

    const name = values[nameIndex]?.trim() || '';
    if (!name) {
      rowErrors.push('Name is required');
    }

    const organization = values[organizationIndex]?.trim() || undefined;
    const organizationEmail = values[organizationEmailIndex]?.trim() || undefined;
    const twitterHandler =
      twitterHandlerIndex >= 0 ? normalizeXHandle(values[twitterHandlerIndex] || '') || undefined : undefined;
    const linkedinHandler =
      linkedinHandlerIndex >= 0 ? normalizeLinkedInHandle(values[linkedinHandlerIndex] || '') || undefined : undefined;
    const telegramHandler =
      telegramHandlerIndex >= 0 ? normalizeTelegramHandle(values[telegramHandlerIndex] || '') || undefined : undefined;
    const role = values[roleIndex]?.trim() || undefined;
    const investmentType =
      investmentTypeIndex >= 0 ? parseInvestmentType(values[investmentTypeIndex] || '') : undefined;
    const typicalCheckSize = typicalCheckSizeIndex >= 0 ? parseNumber(values[typicalCheckSizeIndex] || '') : undefined;
    const investInStartupStages =
      investInStartupStagesIndex >= 0 ? parseArrayFromPipe(values[investInStartupStagesIndex] || '') : undefined;
    const secRulesAccepted =
      secRulesAcceptedIndex >= 0 ? parseInvestorCsvBoolean(values[secRulesAcceptedIndex] || '') : undefined;

    const makeTeamLead =
      makeTeamLeadIndex >= 0
        ? !values[makeTeamLeadIndex]
          ? true
          : parseInvestorCsvBoolean(values[makeTeamLeadIndex] || '')
        : true;

    const willBeTeamLead = Boolean(organization || makeTeamLead);

    if (email) {
      participants.push({
        email,
        name,
        organization,
        organizationEmail,
        twitterHandler,
        linkedinHandler,
        telegramHandler,
        role,
        investmentType,
        typicalCheckSize,
        investInStartupStages,
        secRulesAccepted,
        makeTeamLead,
        willBeTeamLead,
        errors: rowErrors.length > 0 ? rowErrors : undefined,
      });
    }
  }

  return { participants, errors };
};

export const toInvestorParticipantsForApi = (participants: ParsedInvestorParticipant[]): InvestorParticipantForApi[] =>
  participants.map(({ willBeTeamLead, errors, ...participant }) => participant);

export const downloadInvestorCsvTemplate = (filename = 'participants_template.csv') => {
  const headers = [
    'email',
    'name',
    'organization_name',
    'organization_email',
    'x_handle',
    'linkedin_handle',
    'telegram_handler',
    'role',
    'investment_type',
    'typical_check_size',
    'investment_stages',
    't&c',
    'team_lead',
  ];
  const exampleRow = [
    'investor@example.com',
    'John Doe',
    'Example Fund',
    'contact@examplefund.com',
    'johndoe',
    'johndoe',
    'johndoe',
    'Lead',
    'I invest through fund(s)',
    '50000',
    '"Pre-seed,Seed"',
    'true',
    'true',
  ];
  const csvContent = [headers.join(','), exampleRow.join(',')].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const revalidateParsedInvestorParticipant = (
  participant: ParsedInvestorParticipant,
  field: keyof Omit<ParsedInvestorParticipant, 'errors' | 'willBeTeamLead'>,
  value: string | boolean | number | string[] | null
): ParsedInvestorParticipant => {
  const updated = { ...participant, [field]: value };
  const errors: string[] = [];

  if (field === 'email' || !updated.email) {
    const email = typeof value === 'string' && field === 'email' ? value.trim()?.toLowerCase() : updated.email;
    if (!email) {
      errors.push('Email is required');
    } else if (!validateInvestorEmail(email)) {
      errors.push('Invalid email format');
    }
    if (field === 'email') updated.email = email;
  }

  if (field === 'name' || !updated.name) {
    const name = typeof value === 'string' && field === 'name' ? value.trim() : updated.name;
    if (!name) {
      errors.push('Name is required');
    }
    if (field === 'name') updated.name = name;
  }

  updated.willBeTeamLead = Boolean(updated.organization || updated.makeTeamLead);
  updated.errors = errors.length > 0 ? errors : undefined;

  return updated;
};
