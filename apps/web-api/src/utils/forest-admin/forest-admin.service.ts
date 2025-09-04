/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { APP_ENV } from '../constants';
import { LogService } from '../../shared/log.service';

@Injectable()
export class ForestAdminService {
  constructor(
    private readonly logService: LogService
  ) {
  }
  async triggerAirtableSync() {
    try {
      const allSlugs = airtableSlugs();
      await Promise.all([
        highTouchSync(allSlugs['team']),
        highTouchSync(allSlugs['member']),
        highTouchSync(allSlugs['industry']),
      ]);
    } catch (e) {
      console.log(e);
    }
  }
}

function airtableSlugs() {
  //TODO - Move these to envs
  return process.env.ENVIRONMENT === APP_ENV.PRODUCTION
    ? { 
        team: 'team-to-pln-airtable',
        member: 'member-to-pln-airtable',
        industry: 'industry-tag-to-pln-airtable',
      }
    : {
        team: 'team-stage-to-airtable-stage',
        member: 'member-stage-to-airtable-stage',
        industry: 'industry-tag-stage-to-airtable-stage',
      };
}

function highTouchSync(slug) {
  return axios.post(
    'https://api.hightouch.com/api/v1/syncs/trigger',
    { syncSlug: slug },
    {
      headers: {
        Authorization: `Bearer ${process.env.HIGHTOUCH_API_KEY}`,
      },
    }
  );
}
