import { Test, TestingModule } from '@nestjs/testing';
import { SlackService } from './slack.service';
import axios from 'axios';

jest.mock('axios');

describe('SlackService', () => {
  let service: SlackService;
  const mockedAxiosPost = axios.post as jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SlackService],
    }).compile();

    service = module.get<SlackService>(SlackService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should send a notification to the Slack channel', async () => {
    mockedAxiosPost.mockResolvedValue({
      data: { ok: true },
    });
    const payload = {
      requestLabel: 'New Request',
      url: 'https://example.com/request/123',
      name: 'Example Request',
    };
    await service.notifyToChannel(payload);

    expect(mockedAxiosPost).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      {
        channel: process.env.CHANNEL_ID,
        text: `${payload.requestLabel} : ${payload.name} \n${payload.url}`,
      },
      {
        headers: {
          Authorization: 'Bearer ' + process.env.SLACK_BOT_TOKEN,
          ContentType: 'application/json; charset=UTF-8',
        },
      }
    );
  });

  it('should handle errors when axios fails', async () => {
    const error = new Error('Network Error');
    mockedAxiosPost.mockRejectedValue(error);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const payload = {
      requestLabel: 'New Request',
      url: 'https://example.com/request/123',
      name: 'Example Request',
    };

    await service.notifyToChannel(payload);
    expect(consoleSpy).toHaveBeenCalledWith(error);
  });
});
