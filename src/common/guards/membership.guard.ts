import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'

@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    const userId: string | undefined = req?.user?.userId
    const eventId: string | undefined = req?.params?.id
    if (!userId || !eventId) throw new ForbiddenException()
    const member = await this.prisma.member.findUnique({ where: { eventId_userId: { eventId, userId } } })
    if (!member || (member.status !== 'JOINED' && member.status !== 'COMMITTED')) throw new ForbiddenException()
    return true
  }
}
