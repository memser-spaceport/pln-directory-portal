/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SlackService {
  async notifyToChannel({ requestLabel, url, name }) {
    try {
      const content = `${requestLabel} : ${name} \n${url}`;

      const slackResponse = await axios({
        method: 'post',
        url: 'https://slack.com/api/chat.postMessage',
        data: {
          channel: process.env.CHANNEL_ID,
          text: content,
        },
        headers: {
          Authorization: 'Bearer ' + process.env.SLACK_BOT_TOKEN,
          ContentType: 'application/json; charset=UTF-8',
        },
      });
      const slackData = slackResponse.data;
      console.log(slackData);
    } catch (e) {
      console.error(e);
    }
  }
}