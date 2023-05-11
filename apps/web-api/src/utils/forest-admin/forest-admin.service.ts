/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { APP_ENV } from '../constants';

@Injectable()
export class ForestAdminService {
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
  return process.env.ENVIRONMENT === APP_ENV.PRODUCTION
    ? {
        team: 'team-stage-to-airtable',
        member: 'member-stage-to-airtable',
        industry: 'industry-tag-stage-to-airtable',
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
