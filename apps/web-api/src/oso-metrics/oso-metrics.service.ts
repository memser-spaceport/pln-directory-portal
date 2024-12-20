import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { OsoPrismaService } from '../shared/oso-prisma.service';
import { LogService } from '../shared/log.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class OsoMetricsService {
  constructor(private prisma: OsoPrismaService, private logger: LogService) {}

  findAll() {
    try {
      return this.prisma.oso_codeMetricsByProjectV1.findMany();
    } catch (error) {
      throw new InternalServerErrorException(`Error occured while retrieving project metrics data: ${error.message}`);
    }
  }

  async findOne(displayName: string) {
    try {
      const metric = await this.prisma.oso_codeMetricsByProjectV1.findFirst({
        where: { displayName },
      });
      if (!metric) {
        throw new NotFoundException(`Metric with display name "${displayName}" not found.`);
      }
      return metric;
    } catch (error) {
      throw new InternalServerErrorException(`Error occured while retrieving project metrics data: ${error.message}`);
    }
  }
}
