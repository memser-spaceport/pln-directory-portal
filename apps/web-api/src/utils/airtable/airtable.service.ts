import { Injectable } from '@nestjs/common';
import {
  IAirtableIndustryTag,
  IAirtableMember,
  IAirtableTeam,
} from '@protocol-labs-network/airtable';
import axios from 'axios';

@Injectable()
export class AirtableService {
  private apiUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
  private apiTables = {
    teams: process.env.AIRTABLE_TEAMS_TABLE_ID,
    members: process.env.AIRTABLE_MEMBERS_TABLE_ID,
    industryTags: process.env.AIRTABLE_INDUSTRY_TAGS_TABLE_ID,
  };

  private async getFromAirtable(tableId: string | undefined): Promise<any> {
    const results = [] as any[];

    if (!tableId) {
      console.table(this.apiTables);
      throw Error('Missing table id(s)');
    }

    const fetchResults = async (offset?) => {
      return await axios
        .get(`${this.apiUrl}/${tableId}${offset ? `?offset=${offset}` : ''}`, {
          headers: {
            Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
          },
        })
        .then(async (response) => {
          results.push(...response?.data?.records);
          if (response?.data?.offset) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            await fetchResults(response.data.offset);
          }
        })
        .catch((error) => {
          throw Error(error);
        });
    };

    await fetchResults();
    return results;
  }

  public async getAllTeams(): Promise<IAirtableTeam[]> {
    return await this.getFromAirtable(this.apiTables.teams);
  }

  public async getAllMembers(): Promise<IAirtableMember[]> {
    return await this.getFromAirtable(this.apiTables.members);
  }

  public async getAllIndustryTags(): Promise<IAirtableIndustryTag[]> {
    return await this.getFromAirtable(this.apiTables.industryTags);
  }
}
