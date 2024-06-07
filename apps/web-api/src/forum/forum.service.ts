import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import { LogService } from '../shared/log.service';

@Injectable()
export class ForumService {

  constructor(
    private logger: LogService
  ) {}

  async updateUser(member, authToken) {
    let response:any = {};
    try {
      response = await axios.put(`${process.env.FORUM_API_URL}/users/${member.email}`, 
        {
          ...member
        },
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          }
        }
      );
    } catch (error) {
      this.handleAuthErrors(error);
    }
    return response?.data;
  }

  private handleAuthErrors(error) {
    this.logger.error(error);
    if (error?.response?.status === 401) {
      throw new UnauthorizedException('Unauthorized');
    } else if (error?.response?.status === 400) {
      throw new BadRequestException();
    } else if (error?.response?.status === 403) {
      throw new ForbiddenException();
    } else {
      throw new InternalServerErrorException('Unexpected error. Please try again', { cause: error });
    }
  }
}
