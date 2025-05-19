import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { CREATE, DELETE, UPDATE } from '../utils/constants';
import { LogService } from '../shared/log.service';

@Injectable()
export class HuskyRevalidationService {
  constructor(private logService: LogService) {
  }

  async triggerHuskyRevalidation(resource: string, uid: string, action: string): Promise<any> {
    const baseUrl = process.env.WEBHOOK_BASE_URL;
    if (!baseUrl) {
      this.logService.error('WEBHOOK_BASE_URL is not defined in the environment variables.');
      return;
    }
    const url = `${baseUrl}/${resource}`;
    try {
      switch (action) {
        case CREATE:
          return await axios.post(url, { uid: uid });
        case UPDATE:
          return await axios.put(url, { uid: uid });
        case DELETE:
          return await axios.delete(url);
      }
    } catch (error) {
      this.logService.error(`Failed to trigger husky revalidate workflow: ${error.message}`);
      return;
    }
  }
} 