import {
  IListOptions,
  IMember,
  IMemberWithTeams,
  ITeam,
} from '@protocol-labs-network/api';
import Airtable from 'airtable';
import {
  IAirtableMember,
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
    const teams: IAirtableTeam[] = (await this._teamsTable
      .select(options)
      .all()) as unknown as IAirtableTeam[];

    return this._parseTeams(teams);
  }

  /**
   * Get a specific team from Airtable.
   */
  public async getTeam(id: string) {
    const team: IAirtableTeam = await this._teamsTable.find(id);

    return this._parseTeam(team);
  }

  /**
   * Get Name, Logo, Short description, Industry, Website
   * and Twitter fields for provided teams
   */
  public async getTeamCardsData(teams: string[]) {
    const teamsByIdFormula = this._getTeamIdSearchFormula(teams);
    const listOptions: IListOptions = {
      filterByFormula: [
        'AND(',
        'AND(',
        ['{Name} != ""', '{Short description} != ""'].join(', '),
        '), ',
        `OR(${teamsByIdFormula.join(', ')})`,
        ')',
      ].join(''),
      fields: [
        'Name',
        'Logo',
        'Short description',
        'Industry',
        'Website',
        'Twitter',
      ],
      sort: [{ field: 'Name', direction: 'asc' }],
    };

    return await airtableService.getTeams(listOptions);
  }

  /**
   * Get values (and available values) for teams filters.
   */
  public async getTeamsFiltersValues(options: IListOptions) {
    const [valuesByFilter, availableValuesByFilter] = await Promise.all([
      this._getAllTeamsFiltersValues(),
      this._getAvailableTeamsFiltersValues(options),
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
    const members: IAirtableMember[] = (await this._membersTable
      .select(options)
      .all()) as unknown as IAirtableTeam[];

    return this._parseMembers(members);
  }

  /**
   * Get a specific member from Airtable.
   */
  public async getMember(id: string) {
    const member: IAirtableMember = await this._membersTable.find(id);

    return this._parseMember(member);
  }

  /**
   * Get Name, Role, Profile picture, Email, Twitter and Teams
   * fields for the members of the provided team
   */
  public async getTeamMembers(teamName: string) {
    const membersOptions: IListOptions = {
      filterByFormula: this._getSearchFormula(teamName, 'Teams'),
      fields: [
        'Name',
        'Role',
        'Profile picture',
        'Email',
        'Twitter',
        'Teams',
        'Github Handle',
        'Discord handle',
      ],
      sort: [{ field: 'Name', direction: 'asc' }],
    };

    const members = await airtableService.getMembers(membersOptions);
    const membersTeamsNames = await this._getMembersTeamsNames(members);

    return this._parseMemberTeams(members, membersTeamsNames);
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
   * Parse Airtable's team records into the appropriate format.
   */
  private _parseTeams(teams: IAirtableTeam[]): ITeam[] {
    return teams.map((team) => this._parseTeam(team));
  }

  /**
   * Parse Airtable's team record into the appropriate format.
   */
  private _parseTeam(team: IAirtableTeam): ITeam {
    return {
      filecoinUser: !!team.fields['Filecoin User'],
      fundingStage: team.fields['Funding Stage'] || null,
      fundingVehicle: team.fields['Funding Vehicle'] || [],
      id: team.id,
      industry: team.fields.Industry || [],
      ipfsUser: !!team.fields['IPFS User'],
      members: team.fields['Network members'] || [],
      logo: (team.fields.Logo && team.fields.Logo[0]?.url) || null,
      longDescription: team.fields['Long description'] || null,
      name: team.fields.Name || null,
      shortDescription: team.fields['Short description'] || null,
      twitter: team.fields.Twitter || null,
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
   * Parse Airtable's member records into the appropriate format.
   */
  private _parseMembers(members: IAirtableMember[]): IMember[] {
    return members.map((member) => this._parseMember(member));
  }

  /**
   * Parse Airtable's member record into the appropriate format.
   */
  private _parseMember(member: IAirtableMember): IMember {
    return {
      discordHandle: member.fields['Discord handle'] || null,
      displayName: member.fields['Display Name'] || null,
      email: member.fields.Email || null,
      githubHandle: member.fields['Github Handle'] || null,
      id: member.id,
      image:
        (member.fields['Profile picture'] &&
          member.fields['Profile picture'][0]?.url) ||
        null,
      location: this._parseMemberLocation(member),
      name: member.fields.Name || null,
      role: member.fields.Role || null,
      skills: member.fields.Skills || [],
      teams: member.fields.Teams || [],
      twitter: member.fields.Twitter || null,
      officeHours: member.fields['Office hours link'] || null,
    };
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
   * Get all unique values for Teams Directory filters fields.
   */
  private async _getAllTeamsFiltersValues() {
    const teams: IAirtableTeam[] = (await this._teamsTable
      .select({
        fields: [
          'Industry',
          'Funding Stage',
          'Funding Vehicle',
          'IPFS User',
          'Filecoin User',
        ],
      })
      .all()) as unknown as IAirtableTeam[];

    return this._parseTeamsFilters(teams);
  }

  /**
   * Get available unique values for Teams Directory filters fields.
   */
  private async _getAvailableTeamsFiltersValues(options: IListOptions) {
    const teams: IAirtableTeam[] = (await this._teamsTable
      .select({
        fields: [
          'Industry',
          'Funding Stage',
          'Funding Vehicle',
          'IPFS User',
          'Filecoin User',
        ],
        ...options,
      })
      .all()) as unknown as IAirtableTeam[];

    return this._parseTeamsFilters(teams);
  }

  /**
   * Parse teams fields values into lists of unique values per field.
   */
  private _parseTeamsFilters(teams: IAirtableTeam[]) {
    const filtersValues: IAirtableTeamsFiltersValues = teams.reduce(
      (values, team) => {
        const industry = [
          ...new Set([...values.industry, ...(team.fields.Industry || [])]),
        ];
        const fundingStage = [
          ...new Set([
            ...values.fundingStage,
            ...(team.fields['Funding Stage']
              ? [team.fields['Funding Stage']]
              : []),
          ]),
        ];
        const fundingVehicle = [
          ...new Set([
            ...values.fundingVehicle,
            ...(team.fields['Funding Vehicle'] || []),
          ]),
        ];
        const technology = [
          ...new Set([
            ...values.technology,
            ...(team.fields['IPFS User'] ? ['IPFS'] : []),
            ...(team.fields['Filecoin User'] ? ['Filecoin'] : []),
          ]),
        ];

        return { industry, fundingStage, fundingVehicle, technology };
      },
      {
        industry: [],
        fundingStage: [],
        fundingVehicle: [],
        technology: [],
      } as IAirtableTeamsFiltersValues
    );

    Object.values(filtersValues).forEach((value) => value.sort());

    return filtersValues;
  }

  /**
   * Get names for the teams of the provided members
   */
  private async _getMembersTeamsNames(
    members: IMember[]
  ): Promise<{ [teamId: string]: string }> {
    const uniqueTeamsIds = members.reduce(
      (teamIds, member) => [...new Set([...teamIds, ...member.teams])],
      [] as string[]
    );

    const teamsByIdFormula = this._getTeamIdSearchFormula(uniqueTeamsIds);
    const listOptions = {
      filterByFormula: [
        'AND(',
        'AND(',
        ['{Name} != ""', '{Short description} != ""'].join(', '),
        '), ',
        `OR(${teamsByIdFormula.join(', ')})`,
        ')',
      ].join(''),
      fields: ['Name'],
    };

    const membersTeams = await this.getTeams(listOptions);

    return membersTeams.reduce((namesByTeamId, team) => {
      namesByTeamId[team.id] = team.name || '';

      return namesByTeamId;
    }, {} as { [teamId: string]: string });
  }

  /**
   * Returns members with the names of the teams they belong to
   */
  private _parseMemberTeams(
    members: IMember[],
    membersTeamsNames: { [teamId: string]: string }
  ): IMemberWithTeams[] {
    return members.map((member) => ({
      ...member,
      teams: member.teams.reduce((teams, id) => {
        teams[id] = membersTeamsNames[id];
        return teams;
      }, {} as { [teamId: string]: string }),
    }));
  }

  /**
   * Returns a formula to search results that match provided string
   * to a given field
   */
  private _getSearchFormula(queryValue: string, field: string) {
    return `SEARCH("${queryValue}",${field})`;
  }

  /**
   * Returns a formula to search results for teams by id
   */
  private _getTeamIdSearchFormula(teams: string[]) {
    return teams.map((id) => {
      return `RECORD_ID()='${id}'`;
    });
  }
}

const airtableService = new AirtableService();
Object.freeze(airtableService);
export default airtableService;
