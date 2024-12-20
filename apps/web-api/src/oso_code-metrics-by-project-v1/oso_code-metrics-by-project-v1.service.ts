import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { OsoPrismaService } from '../shared/oso-prisma.service';

@Injectable()
export class OsoCodeMetricsByProjectV1Service {
  constructor(private prisma: OsoPrismaService) {}

  findAll() {
    try {
      return this.prisma.oso_codeMetricsByProjectV1.findMany();
    } catch (error) {
      throw new InternalServerErrorException(`Error occured while retrieving project metrics data: ${error.message}`);
    }
  }

  findOne(displayName: string) {
    try {
      return (
        this.prisma.oso_codeMetricsByProjectV1.findFirst({
          where: { displayName },
        }) ?? {}
      );
    } catch (error) {
      throw new InternalServerErrorException(`Error occured while retrieving project metrics data: ${error.message}`);
    }
  }
}
