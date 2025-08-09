import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { PreferencesDto, UpdateMeDto, UserInterestsDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  async me(userId: string) {
    const user = await this.repo.findById(userId);
    return user;
  }

  async update(userId: string, dto: UpdateMeDto) {
    return this.repo.update(userId, dto as any);
  }

  async updatePreferences(userId: string, dto: PreferencesDto) {
    return this.repo.update(userId, dto as any);
  }

  async setInterests(userId: string, dto: UserInterestsDto) {
    return this.repo.update(userId, { interests: dto.interestIds } as any);
  }
}
