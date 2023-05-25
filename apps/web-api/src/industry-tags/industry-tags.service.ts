import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IAirtableIndustryTag } from '@protocol-labs-network/airtable';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class IndustryTagsService {
  constructor(private prisma: PrismaService) {}

  findAll(queryOptions: Prisma.IndustryTagFindManyArgs) {
    return this.prisma.industryTag.findMany(queryOptions);
  }

  findOne(
    uid: string,
    queryOptions: Omit<Prisma.IndustryTagFindUniqueArgsBase, 'where'> = {}
  ) {
    return this.prisma.industryTag.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }

  async insertManyFromAirtable(airtableIndustryTags: IAirtableIndustryTag[]) {
    const industryCategories = await this.prisma.industryCategory.findMany();
    return this.prisma.$transaction(
      airtableIndustryTags.map((industryTag) => {
        const airtableCategory = !!industryTag.fields.Categories
          ? industryTag.fields.Categories[0]
          : '';
        const relatedCategory = !!industryTag.fields.Categories?.length
          ? industryCategories.find(
              (category) => category.title === airtableCategory
            )
          : null;

        return this.prisma.industryTag.upsert({
          where: { airtableRecId: industryTag.id },
          update: {
            definition: industryTag.fields.Definition,
            industryCategoryUid: relatedCategory?.uid,
          },
          create: {
            airtableRecId: industryTag.id,
            title: industryTag.fields.Tags,
            definition: industryTag.fields.Definition,
            industryCategoryUid: relatedCategory?.uid,
          },
        });
      })
    );
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
