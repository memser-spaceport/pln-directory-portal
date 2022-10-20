import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class IndustryTagsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.industryTag.findMany();
  }

  findOne(uid: string) {
    return this.prisma.industryTag.findUniqueOrThrow({ where: { uid } });
  }

  // create(
  //   createIndustryTagData: Prisma.IndustryTagUncheckedCreateInput
  // ): Promise<IndustryTag> {
  //   return this.prisma.industryTag.create({ data: createIndustryTagData });
  // }

  // update(uid: string, updateIndustryTagDto: Prisma.IndustryTagUpdateInput) {
  //   return this.prisma.industryTag.update({
  //     where: { uid },
  //     data: updateIndustryTagDto,
  //   });
  // }

  // remove(uid: string) {
  //   return this.prisma.industryTag.delete({ where: { uid } });
  // }
}
