import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { AdminAuthGuard } from '../../guards/admin-auth.guard';
import { SearchMembersV2Dto } from '../dto/search-members-v2.dto';
import {NoCache} from "../../decorators/no-cache.decorator";

@Controller('v2/admin/access-control-v2')
@UseGuards(AdminAuthGuard)
export class AdminAccessControlV2MetaController {
  constructor(private readonly prisma: PrismaService) {}

  @NoCache()
  @Get('members/search')
  async searchMembers(@Query() query: SearchMembersV2Dto) {
    const q = (query.q || '').trim();

    const where =
      q.length < 2
        ? {}
        : {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
              { uid: { contains: q, mode: 'insensitive' as const } },
            ],
          };

    return this.prisma.member.findMany({
      where,
      select: {
        uid: true,
        name: true,
        email: true,
      },
      orderBy: { createdAt: 'desc' },
      take: q.length < 2 ? 25 : 50,
    });
  }

  @NoCache()
  @Get('permissions')
  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: { code: 'asc' },
      select: {
        uid: true,
        code: true,
        description: true,
      },
    });
  }
}
