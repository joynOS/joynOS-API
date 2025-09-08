import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { PreferencesDto, UpdateMeDto, UserInterestsDto } from './dto';
import { PrismaService } from '../../database/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { randomUUID } from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly prisma: PrismaService,
    private readonly assetsService: AssetsService,
  ) {}

  async me(userId: string) {
    const user = await this.repo.findById(userId);
    if (!user) return null;
    const interestsCount = await this.prisma.userInterest.count({
      where: { userId },
    });
    return { ...user, hasInterests: interestsCount > 0 } as any;
  }

  async update(
    userId: string,
    dto: UpdateMeDto,
    avatarFile?: Express.Multer.File,
  ) {
    const updateData = { ...dto };

    if (avatarFile) {
      const avatarUrl = await this.assetsService.uploadFile(
        avatarFile.buffer,
        `avatars/${randomUUID()}.${this.getFileExtension(avatarFile.originalname)}`,
        avatarFile.mimetype,
      );
      (updateData as any).avatar = avatarUrl;
    }

    return this.repo.update(userId, updateData as any);
  }

  async updatePreferences(userId: string, dto: PreferencesDto) {
    return this.repo.update(userId, dto as any);
  }

  async setInterests(userId: string, dto: UserInterestsDto) {
    await this.prisma.userInterest.deleteMany({ where: { userId } });
    if (dto.interestIds?.length) {
      await this.prisma.userInterest.createMany({
        data: dto.interestIds.map((interestId) => ({
          userId,
          interestId,
          weight: 1,
        })),
        skipDuplicates: true,
      });
    }
    return this.repo.findById(userId);
  }

  private getFileExtension(filename: string): string {
    return filename.split('.').pop() || 'jpg';
  }
}
