import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LoginRequestDto, LoginRequestSchema } from 'libs/contracts/src/schema';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { AdminService } from './admin.service';
import { ApiBodyFromZod } from '../decorators/api-body-from-zod';

@ApiTags('Admin')
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
  @ApiBodyFromZod(LoginRequestSchema)
  @UsePipes(ZodValidationPipe)
  async login(@Body() loginRequestDto: LoginRequestDto): Promise<{ accessToken: string }> {
    const { username, password } = loginRequestDto;
    return await this.adminService.login(username, password);
  }
}
