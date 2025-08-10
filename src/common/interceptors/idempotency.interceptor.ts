import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { createHash } from 'crypto';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  async intercept(context: ExecutionContext, next: CallHandler<any>) {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) return next.handle();
    const found = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (found) throw new ConflictException('Duplicate idempotency key');
    const res = await lastValueFrom(next.handle());
    const hash = createHash('sha256')
      .update(JSON.stringify(res ?? {}))
      .digest('hex');
    await this.prisma.idempotencyKey.create({
      data: {
        key,
        method: req.method,
        path: req.originalUrl || req.url,
        userId: req.user?.userId,
        statusCode: 200,
        responseHash: hash,
      },
    });
    return res;
  }
}
