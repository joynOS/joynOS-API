import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('Interests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('interests')
export class InterestsController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  @ApiOperation({ summary: 'List interests' })
  @ApiResponse({ status: 200 })
  async list() { return this.prisma.interest.findMany({ orderBy: { label: 'asc' } }) }
}
