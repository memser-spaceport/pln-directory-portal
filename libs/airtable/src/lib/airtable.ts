import * as Airtable from 'airtable';
import { IAirtableLabber, IAirtableTeam } from '../models';

/**
 * Service to collect data from Airtable.
 *
 * @class AirtableService
 */
class AirtableService {
  private static _instance: AirtableService;

  private _teamsTable: Airtable.Table<Airtable.FieldSet>;
  private _labbersTable: Airtable.Table<Airtable.FieldSet>;

  constructor() {
    if (!AirtableService._instance) {
      this._init();
      AirtableService._instance = this;
    }

    return AirtableService._instance;
  }

  /**
   * Get all teams from Airtable.
   *
   * @return {*}  {Promise<IAirtableTeam[]>}
   * @memberof AirtableService
   */
  public async getAllTeams(): Promise<IAirtableTeam[]> {
    const teams = await this._teamsTable.select().all();

    return JSON.parse(JSON.stringify(teams)) as IAirtableTeam[];
  }

  /**
   * Get a specific team from Airtable.
   *
   * @param {string} id
   * @return {*}  {Promise<IAirtableTeam>}
   * @memberof AirtableService
   */
  public async getTeam(id: string): Promise<IAirtableTeam> {
    const team = await this._teamsTable.find(id);

    return JSON.parse(JSON.stringify(team)) as IAirtableTeam;
  }

  /**
   * Get all labbers from Airtable.
   *
   * @return {*}  {Promise<IAirtableLabber[]>}
   * @memberof AirtableService
   */
  public async getAllLabbers(): Promise<IAirtableLabber[]> {
    const labbers = await this._labbersTable.select().all();

    return JSON.parse(JSON.stringify(labbers)) as IAirtableLabber[];
  }

  /**
   * Get a specific labber from Airtable.
   *
   * @param {string} id
   * @return {*}  {Promise<IAirtableLabber>}
   * @memberof AirtableService
   */
  public async getLabber(id: string): Promise<IAirtableLabber> {
    const labber = await this._labbersTable.find(id);

    return JSON.parse(JSON.stringify(labber)) as IAirtableLabber;
  }

  /**
   * Service initialization.
   *
   * @private
   * @memberof AirtableService
   */
  private _init() {
    const base = new Airtable({
      apiKey: `${process.env.AIRTABLE_API_KEY}`,
    }).base(`${process.env.AIRTABLE_BASE_ID}`);

    this._teamsTable = base(`${process.env.AIRTABLE_TEAMS_TABLE_ID}`);
    this._labbersTable = base(`${process.env.AIRTABLE_LABBERS_TABLE_ID}`);
  }
}

const airtableService = new AirtableService();
Object.freeze(airtableService);
export default airtableService;
