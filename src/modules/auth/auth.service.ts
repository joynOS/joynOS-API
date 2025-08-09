import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersRepository } from '../users/users.repository';
import { randomUUID, createHash } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly usersRepo: UsersRepository,
  ) {}

  async signup(email: string, password: string, name: string) {
    const exists = await this.usersRepo.findByEmail(email);
    if (exists) throw new UnauthorizedException();
    const passwordHash = createHash('sha256').update(password).digest('hex');
    const user = await this.usersRepo.create({ email, name, passwordHash });
    return this.issueTokens(user.id);
  }

  async signin(email: string, password: string) {
    const user = await this.usersRepo.findByEmail(email);
    if (!user) throw new UnauthorizedException();
    const passwordHash = createHash('sha256').update(password).digest('hex');
    if (user.passwordHash !== passwordHash) throw new UnauthorizedException();
    return this.issueTokens(user.id);
  }

  async issueTokens(userId: string) {
    const access = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: process.env.JWT_ACCESS_SECRET || 'dev-secret',
        expiresIn: '15m',
      },
    );
    const refresh = await this.jwt.signAsync(
      { sub: userId, typ: 'refresh' },
      {
        secret: process.env.JWT_REFRESH_SECRET || 'dev-refresh',
        expiresIn: '7d',
      },
    );
    await this.usersRepo.saveRefreshToken(userId, refresh);
    return { accessToken: access, refreshToken: refresh };
  }

  async refresh(userId: string, token: string) {
    const stored = await this.usersRepo.getRefreshToken(userId);
    if (stored !== token) throw new UnauthorizedException();
    return this.issueTokens(userId);
  }

  async logout(userId: string) {
    await this.usersRepo.saveRefreshToken(userId, '');
    return { ok: true };
  }
}
