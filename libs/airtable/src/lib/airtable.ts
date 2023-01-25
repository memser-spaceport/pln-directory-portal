import {
  IListOptions,
  IMember,
  IMemberTeam,
  ITeam,
} from '@protocol-labs-network/api';
import * as Sentry from '@sentry/node';
import Airtable from 'airtable';
import {
  IAirtableMember,
  IAirtableMembersFiltersValues,
  IAirtableTeam,
  IAirtableTeamsFiltersValues,
} from '../models';

/**
 * Service to collect data from Airtable.
 *
 * @class AirtableService
 */
class AirtableService {
  private static _instance: AirtableService;

  private _teamsTable!: Airtable.Table<Airtable.FieldSet>;
  private _membersTable!: Airtable.Table<Airtable.FieldSet>;

  constructor() {
    if (!AirtableService._instance) {
      this._init();
      AirtableService._instance = this;
    }

    return AirtableService._instance;
  }

  /**
   * Get teams from Airtable.
   */
  public async getTeams(options: IListOptions) {
    try {
      const teams: IAirtableTeam[] = (await this._teamsTable
        .select(options)
        .all()) as unknown as IAirtableTeam[];

      return this.parseTeams(teams);
    } catch (error) {
      this._logErrorsOnSentry(error, options, 'getTeams');
      throw error;
    }
  }

  /**
   * Get first page of teams from Airtable.
   */
  public async getFirstTeamsPage(options: IListOptions) {
    try {
      const teams: IAirtableTeam[] = (await this._teamsTable
        .select(options)
        .firstPage()) as unknown as IAirtableTeam[];

      return this.parseTeams(teams);
    } catch (error) {
      this._logErrorsOnSentry(error, options, 'getFirstTeamsPage');
      throw error;
    }
  }

  /**
   * Get a specific team from Airtable.
   */
  public async getTeam(id: string) {
    try {
      const team: IAirtableTeam = await this._teamsTable.find(id);

      return this._parseTeam(team);
    } catch (error) {
      this._logErrorsOnSentry(error, { id }, 'getTeam');
      throw error;
    }
  }

  /**
   * Get provided fields for provided teams
   */
  public async getTeamCardsData(memberTeams: IMemberTeam[], fields: string[]) {
    const teamsIds = memberTeams.map(({ id }) => id);
    const teamsByIdFormula = this._getTeamIdSearchFormula(teamsIds);
    const listOptions: IListOptions = {
      filterByFormula: [
        'AND(',
        'AND(',
        ['{Name} != ""', '{Short description} != ""'].join(', '),
        '), ',
        `OR(${teamsByIdFormula.join(', ')})`,
        ')',
      ].join(''),
      fields,
    };

    const teams = await airtableService.getTeams(listOptions);
    const teamsOnOriginalOrder = teamsIds.reduce((sortedTeams, id) => {
      const teamWithProvidedId = teams.find((team) => team.id === id);

      !!teamWithProvidedId && sortedTeams.push(teamWithProvidedId as ITeam);

      return sortedTeams;
    }, <ITeam[]>[]);

    return teamsOnOriginalOrder;
  }

  /**
   * Get values (and available values) for teams filters.
   */
  public async getTeamsFiltersValues(options: IListOptions) {
    const [valuesByFilter, availableValuesByFilter] = await Promise.all([
      this._getTeamsFiltersValues({
        filterByFormula:
          'AND({Name} != "", {Short description} != "", {Friend of PLN} = FALSE())',
      }),
      this._getTeamsFiltersValues(options),
    ]);

    return {
      valuesByFilter,
      availableValuesByFilter,
    };
  }

  /**
   * Get members from Airtable.
   */
  public async getMembers(options: IListOptions = {}) {
    try {
      const members: IAirtableMember[] = (await this._membersTable
        .select(options)
        .all()) as unknown as IAirtableTeam[];

      return this.parseMembers(members);
    } catch (error) {
      this._logErrorsOnSentry(error, options, 'getMembers');
      throw error;
    }
  }

  /**
   * Get a specific member from Airtable.
   */
  public async getMember(id: string) {
    try {
      const member: IAirtableMember = await this._membersTable.find(id);

      return this._parseMember(member);
    } catch (error) {
      this._logErrorsOnSentry(error, { id }, 'getMember');
      throw error;
    }
  }

  /**
   * Get values (and available values) for members filters.
   */
  public async getMembersFiltersValues(options: IListOptions) {
    const [valuesByFilter, availableValuesByFilter] = await Promise.all([
      this._getMembersFiltersValues({
        filterByFormula:
          'AND({Name} != "", {Teams} != "", {Friend of PLN} = FALSE())',
      }),
      this._getMembersFiltersValues(options),
    ]);

    return {
      valuesByFilter,
      availableValuesByFilter,
    };
  }

  /**
   * Get provided fields for the members of the provided team
   */
  public async getTeamMembers(teamName: string, fields: string[]) {
    const membersOptions: IListOptions = {
      filterByFormula: this._findExactMatchFormula(teamName, 'Teams'),
      fields,
      sort: [
        { field: 'Team lead', direction: 'desc' },
        { field: 'Name', direction: 'asc' },
      ],
    };

    return await airtableService.getMembers(membersOptions);
  }

  /**
   * Parse Airtable's team records into the appropriate format.
   */
  public parseTeams(teams: IAirtableTeam[]): ITeam[] {
    return teams.map((team) => this._parseTeam(team));
  }

  /**
   * Parse Airtable's member records into the appropriate format.
   */
  public parseMembers(members: IAirtableMember[]): IMember[] {
    return members.map((member) => this._parseMember(member));
  }

  /**
   * Service initialization.
   */
  private _init() {
    const base = new Airtable({
      apiKey: `${process.env.AIRTABLE_API_KEY}`,
    }).base(`${process.env.AIRTABLE_BASE_ID}`);

    this._teamsTable = base(`${process.env.AIRTABLE_TEAMS_TABLE_ID}`);
    this._membersTable = base(`${process.env.AIRTABLE_MEMBERS_TABLE_ID}`);
  }

  /**
   * Parse Airtable's team record into the appropriate format.
   */
  private _parseTeam(team: IAirtableTeam): ITeam {
    return {
      filecoinUser: !!team.fields['Filecoin User'],
      fundingStage: team.fields['Funding Stage'] || null,
      membershipSources: team.fields['Accelerator Programs'] || [],
      id: team.id,
      tags: team.fields['Tags lookup'] || [],
      ipfsUser: !!team.fields['IPFS User'],
      members: team.fields['Network members'] || [],
      logo:
        (team.fields.Logo &&
          (team.fields.Logo[0]?.thumbnails?.large?.url ||
            team.fields.Logo[0]?.url)) ||
        null,
      longDescription: team.fields['Long description'] || null,
      name: team.fields.Name || null,
      shortDescription: team.fields['Short description'] || null,
      twitter: team.fields.Twitter || null,
      contactMethod: team.fields['Preferred Method of Contact'] || null,
      /**
       * TODO: Remove the website split when Airtable data gets fixed.
       *
       * It is necessary considering that there's one team on Airtable with
       * an invalid website value (`http://xpto.com/ http://otpx.com/`)
       * which needs to be parsed this way.
       */
      website:
        (team.fields.Website && team.fields.Website.split(' ')[0]) || null,
    };
  }

  /**
   * Parse Airtable's member record into the appropriate format.
   */
  private _parseMember(member: IAirtableMember): IMember {
    const teams = this._parseMemberTeams(member);
    const mainTeam = teams[0] || null;

    return {
      discordHandle: member.fields['Discord handle'] || null,
      email: member.fields.Email || null,
      githubHandle: member.fields['Github Handle'] || null,
      id: member.id,
      image:
        (member.fields['Profile picture'] &&
          (member.fields['Profile picture'][0]?.thumbnails?.large?.url ||
            member.fields['Profile picture'][0]?.url)) ||
        null,
      location: this._parseMemberLocation(member),
      mainTeam,
      name: member.fields.Name || null,
      officeHours: member.fields['Office hours link'] || null,
      skills: member.fields.Skills || [],
      teamLead: !!member.fields['Team lead'],
      teams,
      twitter: member.fields.Twitter || null,
    };
  }

  private _parseMemberTeams(member: IAirtableMember) {
    if (!member.fields.Teams) {
      return [];
    }

    const roles = member.fields.Role?.split(', ') || [];

    return member.fields.Teams.map((id, i) => ({
      id,
      name: member.fields['Team name']?.[i] || '',
      role: roles[i] || 'Contributor',
      teamLead: !!member.fields['Team lead'],
      mainTeam: i === 0,
    }));
  }

  /**
   * Parse member location based on available member information.
   */
  private _parseMemberLocation(member: IAirtableMember) {
    if (member.fields['Metro Area']) {
      return member.fields['Metro Area'];
    }

    if (member.fields.Country) {
      if (member.fields.City) {
        return `${member.fields.City}, ${member.fields.Country}`;
      }

      if (member.fields['State / Province']) {
        return `${member.fields['State / Province']}, ${member.fields.Country}`;
      }

      return member.fields.Country;
    }

    return 'Not provided';
  }

  /**
   * Get all values for provided directory filters fields.
   */
  private async _getFiltersValues(
    table: Airtable.Table<Airtable.FieldSet>,
    fields: string[],
    options: IListOptions,
    parser:
      | ((members: IAirtableMember[]) => IAirtableMembersFiltersValues)
      | ((teams: IAirtableTeam[]) => IAirtableTeamsFiltersValues)
  ) {
    try {
      const results: IAirtableMember[] | IAirtableTeam[] = (await table
        .select({
          fields,
          ...options,
        })
        .all()) as unknown as IAirtableMember[] | IAirtableTeam[];

      return parser(results);
    } catch (error) {
      this._logErrorsOnSentry(error, options, 'getFiltersValues', (scope) =>
        scope.setContext('fields', { fields })
      );
      throw error;
    }
  }

  /**
   * Get values for Teams Directory filters fields.
   */
  private async _getTeamsFiltersValues(options: IListOptions = {}) {
    return (await this._getFiltersValues(
      this._teamsTable,
      [
        'Tags lookup',
        'Accelerator Programs',
        'Funding Stage',
        'IPFS User',
        'Filecoin User',
      ],
      options,
      this._parseTeamsFilters
    )) as IAirtableTeamsFiltersValues;
  }

  /**
   * Parse teams fields values into lists of unique values per field.
   */
  private _parseTeamsFilters(teams: IAirtableTeam[]) {
    const filtersValues: IAirtableTeamsFiltersValues = teams.reduce(
      (values, team) => {
        const tags = [
          ...new Set([...values.tags, ...(team.fields['Tags lookup'] || [])]),
        ];
        const membershipSources = [
          ...new Set([
            ...values.membershipSources,
            ...(team.fields['Accelerator Programs'] || []),
          ]),
        ];
        const fundingStage = [
          ...new Set([
            ...values.fundingStage,
            ...(team.fields['Funding Stage']
              ? [team.fields['Funding Stage']]
              : []),
          ]),
        ];
        const technology = [
          ...new Set([
            ...values.technology,
            ...(team.fields['IPFS User'] ? ['IPFS'] : []),
            ...(team.fields['Filecoin User'] ? ['Filecoin'] : []),
          ]),
        ];

        return { tags, membershipSources, fundingStage, technology };
      },
      {
        tags: [],
        membershipSources: [],
        fundingStage: [],
        technology: [],
      } as IAirtableTeamsFiltersValues
    );

    Object.values(filtersValues).forEach((value) => value.sort());

    return filtersValues;
  }

  /**
   * Get values for Members Directory filters fields.
   */
  private async _getMembersFiltersValues(options: IListOptions = {}) {
    return (await this._getFiltersValues(
      this._membersTable,
      ['Skills', 'Region', 'Country', 'Metro Area'],
      options,
      this._parseMembersFilters
    )) as IAirtableMembersFiltersValues;
  }

  /**
   * Parse members fields values into lists of unique values per field.
   */
  private _parseMembersFilters(members: IAirtableMember[]) {
    const filtersValues: IAirtableMembersFiltersValues = members.reduce(
      (values, member) => {
        const skills = [
          ...new Set([...values.skills, ...(member.fields.Skills || [])]),
        ];
        const region = [
          ...new Set([
            ...values.region,
            ...(member.fields['Region'] ? [member.fields['Region']] : []),
          ]),
        ];
        const country = [
          ...new Set([
            ...values.country,
            ...(member.fields['Country'] ? [member.fields['Country']] : []),
          ]),
        ];
        const metroArea = [
          ...new Set([
            ...values.metroArea,
            ...(member.fields['Metro Area']
              ? [member.fields['Metro Area']]
              : []),
          ]),
        ];

        return { skills, region, country, metroArea };
      },
      {
        skills: [],
        region: [],
        country: [],
        metroArea: [],
      } as IAirtableMembersFiltersValues
    );

    Object.values(filtersValues).forEach((value) => value.sort());

    return filtersValues;
  }

  /**
   * Returns a formula to search results that match provided string
   * to a given field
   */
  private _getSearchFormula(queryValue: string, field: string) {
    return `SEARCH("${queryValue}",${field})`;
  }

  /**
   * Returns a formula to search results that exactly match provided string
   * to a given field
   */
  private _findExactMatchFormula(queryValue: string, field: string) {
    return `FIND(", ${queryValue},", ", " & ARRAYJOIN(${field}) & ",")`;
  }

  /**
   * Returns a formula to search results for teams by id
   */
  private _getTeamIdSearchFormula(teams: string[]) {
    return teams.map((id) => {
      return `RECORD_ID()='${id}'`;
    });
  }

  /**
   * Logs error details to Sentry
   */
  private _logErrorsOnSentry(
    error: unknown,
    options: object,
    method: string,
    addAditionalScope?: (scope: Sentry.Scope) => void
  ) {
    Sentry.withScope((scope) => {
      scope.setTag('module', 'AirtableService');
      scope.setTag('method', method);
      scope.setContext('requestOptions', { options });
      addAditionalScope && addAditionalScope(scope);
      Sentry.captureException(error);
    });
    Sentry.flush(2000);
  }
}

const airtableService = new AirtableService();
Object.freeze(airtableService);
export default airtableService;
