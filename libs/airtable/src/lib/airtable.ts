import { ILabber, IListOptions, ITeam } from '@protocol-labs-network/api';
import Airtable from 'airtable';
import {
  IAirtableLabber,
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
  private _labbersTable!: Airtable.Table<Airtable.FieldSet>;

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
   * Get labbers from Airtable.
   */
  public async getLabbers() {
    const labbers: IAirtableLabber[] = (await this._labbersTable
      .select()
      .all()) as unknown as IAirtableTeam[];

    return this._parseLabbers(labbers);
  }

  /**
   * Get a specific labber from Airtable.
   */
  public async getLabber(id: string) {
    const labber: IAirtableLabber = await this._labbersTable.find(id);

    return this._parseLabber(labber);
  }

  /**
   * Service initialization.
   */
  private _init() {
    const base = new Airtable({
      apiKey: `${process.env.AIRTABLE_API_KEY}`,
    }).base(`${process.env.AIRTABLE_BASE_ID}`);

    this._teamsTable = base(`${process.env.AIRTABLE_TEAMS_TABLE_ID}`);
    this._labbersTable = base(`${process.env.AIRTABLE_LABBERS_TABLE_ID}`);
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
      labbers: team.fields['Network members'] || [],
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
   * Parse Airtable's labber records into the appropriate format.
   */
  private _parseLabbers(labbers: IAirtableLabber[]): ILabber[] {
    return labbers.map((labber) => this._parseLabber(labber));
  }

  /**
   * Parse Airtable's labber record into the appropriate format.
   */
  private _parseLabber(labber: IAirtableLabber): ILabber {
    return {
      discordHandle: labber.fields['Discord Handle'] || null,
      displayName: labber.fields['Display Name'] || null,
      email: labber.fields.Email || null,
      id: labber.id,
      image:
        (labber.fields['Profile picture'] &&
          labber.fields['Profile picture'][0]?.url) ||
        null,
      name: labber.fields.Name || null,
      role: labber.fields.Role || null,
      twitter: labber.fields.Twitter || null,
    };
  }

  /**
   * Get all unique values for Teams Directory filters fields.
   */
  private async _getAllTeamsFiltersValues() {
    const teams: IAirtableTeam[] = (await this._teamsTable
      .select({
        fields: ['Industry', 'Funding Stage', 'Funding Vehicle'],
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
        fields: ['Industry', 'Funding Stage', 'Funding Vehicle'],
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

        return { industry, fundingStage, fundingVehicle };
      },
      {
        industry: [],
        fundingStage: [],
        fundingVehicle: [],
      } as IAirtableTeamsFiltersValues
    );

    Object.values(filtersValues).forEach((value) => value.sort());

    return filtersValues;
  }
}

const airtableService = new AirtableService();
Object.freeze(airtableService);
export default airtableService;
