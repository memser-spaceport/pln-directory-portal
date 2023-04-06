import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class GoogleRecaptchaGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { body } = context.switchToHttp().getRequest();
    const captchaResponse = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?response=${body.captchaToken}&secret=${process.env.GOOGLE_RECAPTCHA_SECRET}`
    );
    const captchaData = captchaResponse.data;
    if (!captchaData?.success) {
      throw new ForbiddenException();
    }
    return true;
  }
}
