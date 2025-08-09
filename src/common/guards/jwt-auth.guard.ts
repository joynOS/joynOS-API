import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header = request.headers['authorization'] as string | undefined;
    if (!header) throw new UnauthorizedException();
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer')
      throw new UnauthorizedException();
    const token = parts[1];
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET || 'dev-secret',
      });
      request.user = { userId: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
