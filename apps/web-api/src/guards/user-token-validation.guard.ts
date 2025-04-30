import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import { ActiveMemberEmailGuard } from './active-member-email.guard';
import { MembersService } from '../members/members.service';

@Injectable()
export class UserTokenValidation extends ActiveMemberEmailGuard {
  constructor(protected membersService: MembersService) {
    super(membersService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest();
      const token = this.extractTokenFromHeader(request);
      if (!token) {
        throw new UnauthorizedException('Invalid Session. Please login and try again');
      }
      const validationResult: any = await axios.post(
        `${process.env.AUTH_API_URL}/auth/introspect`,
        { token: token }
      );
      await super.canActivate(context); //perform the base active member email guard logic
      if (
        validationResult?.data?.active &&
        validationResult?.data?.email
      ) {
        request['userEmail'] = validationResult.data.email;
      } else {
        throw new UnauthorizedException();
      }
    } catch(error) {
      if ( error instanceof UnauthorizedException || error?.response?.status === 400
        || error?.response?.status === 401) {
        throw new UnauthorizedException('Invalid Session. Please login and try again');
      }
      throw new InternalServerErrorException();
    }
    return true;
  }
}
