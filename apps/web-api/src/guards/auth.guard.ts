import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { LogService } from '../shared/log.service';
import { MembersService } from '../members/members.service';
import { DIRECTORYADMIN } from '../utils/constants';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private readonly logger: LogService,
    private membersService: MembersService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      this.logger.info('Inside Authguard');

      let request = context.switchToHttp().getRequest();
      const token = this.authService.checkIfTokenAttached(request);
      request = await this.authService.validateToken(request, token);

      if (
        await this.validateUserEmail(
          request.params.uid,
          request.userEmail,
          request.method
        )
      ) {
        this.logger.info('Token validated');
        return true;
      } else {
        this.logger.info(
          'Email in the token is not matching with the requester Email'
        );
        throw new ForbiddenException();
      }
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error?.response?.status === 400 ||
        error?.response?.status === 401 ||
        error?.name === 'NotFoundError'
      ) {
        throw new UnauthorizedException('Invalid Session. Please login and try again');
      }else if(error instanceof ForbiddenException){
        throw new ForbiddenException('Forbidden. Email doesn`t match');
      }
      throw new InternalServerErrorException();
    }
  }

  validateUserEmail = async (uid, email, method) => {
    const memberResponse = await this.membersService.findOne(uid);
    const tokenMemberResponse = await this.membersService.findMemberFromEmail(
      email
    );
    if (method === 'PATCH') {
      return memberResponse && memberResponse.email === email;
    } else {
      return (
        memberResponse &&
        (memberResponse.email === email ||
          this.checkIfAdminUser(tokenMemberResponse))
      );
    }
  };

  checkIfAdminUser = (member) => {
    const roleFilter = member.memberRoles.filter((roles) => {
      return roles.name === DIRECTORYADMIN;
    });
    return roleFilter.length > 0;
  };
}
