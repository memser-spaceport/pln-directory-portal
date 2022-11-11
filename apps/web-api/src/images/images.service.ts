import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ImagesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.image.findMany();
  }

  findOne(uid: string) {
    return this.prisma.image.findUniqueOrThrow({ where: { uid } });
  }

  async bulkCreate(
    originalData: Prisma.ImageCreateInput,
    thumbnails?: Prisma.ImageCreateManyInput[]
  ) {
    const image = await this.prisma.image.create({
      data: {
        ...originalData,
        thumbnails: {
          createMany: {
            data: thumbnails ? thumbnails : [],
          },
        },
      },
      include: {
        thumbnails: true,
      },
    });

    return { image };
  }
}
