import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { LoginRequestDto } from 'libs/contracts/src/schema';
import { ZodValidationPipe } from 'nestjs-zod';
import { AdminService } from './admin.service';

@Controller('v1/admin/auth')
export class AdminAuthController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Handles admin login requests.
   * Validates the request body against the LoginRequestDto schema.
   * @param loginRequestDto - The login request data transfer object
   * @returns Access token if login is successful
   */
  @Post('login')
  @UsePipes(ZodValidationPipe)
  async login(@Body() loginRequestDto: LoginRequestDto): Promise<{ accessToken: string }> {
    const { username, password } = loginRequestDto;
    return await this.adminService.login(username, password);
  }
}
