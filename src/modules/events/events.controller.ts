import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MembershipGuard } from '../../common/guards/membership.guard';
import { EventsService } from './events.service';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import {
  BookingConfirmDto,
  BrowseEventsQueryDto,
  CommitDto,
  CreateMessageDto,
  EventIdParamDto,
  RecommendationsQueryDto,
} from './dto';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly service: EventsService) {}

  @Get('recommendations')
  @ApiOperation({ summary: 'Recommended events' })
  @ApiResponse({ status: 200 })
  async recommendations(
    @Query() query: RecommendationsQueryDto,
    @Req() req: any,
  ) {
    return this.service.recommendations(req.user?.userId);
  }

  @Get('browse')
  @ApiOperation({ summary: 'Browse events' })
  @ApiResponse({ status: 200 })
  async browse(@Query() query: BrowseEventsQueryDto) {
    return this.service.browse(query as any);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Event detail' })
  @ApiResponse({ status: 200 })
  async detail(@Param() params: EventIdParamDto) {
    return this.service.detail(params.id);
  }

  @Get(':id/plans')
  @ApiOperation({ summary: 'List plans' })
  @ApiResponse({ status: 200 })
  async plans(@Param() params: EventIdParamDto) {
    return this.service.listPlans(params.id);
  }

  @Post(':id/plans/:planId/vote')
  @ApiOperation({ summary: 'Vote plan' })
  @ApiResponse({ status: 200 })
  @UseGuards(MembershipGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async vote(
    @Param('id') id: string,
    @Param('planId') planId: string,
    @Req() req: any,
  ) {
    return this.service.votePlan(id, planId, req.user.userId);
  }

  @Post(':id/plans/close')
  @ApiOperation({ summary: 'Close voting' })
  @ApiResponse({ status: 200 })
  async close(@Param() params: EventIdParamDto) {
    return this.service.closeVoting(params.id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join event' })
  @ApiResponse({ status: 200 })
  @UseInterceptors(IdempotencyInterceptor)
  async join(@Param() params: EventIdParamDto, @Req() req: any) {
    return this.service.join(params.id, req.user.userId);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Leave event' })
  @ApiResponse({ status: 200 })
  async leave(@Param() params: EventIdParamDto, @Req() req: any) {
    return this.service.leave(params.id, req.user.userId);
  }

  @Post(':id/commit')
  @ApiOperation({ summary: 'Commit decision' })
  @ApiResponse({ status: 200 })
  async commit(
    @Param() params: EventIdParamDto,
    @Body() dto: CommitDto,
    @Req() req: any,
  ) {
    return this.service.commit(params.id, req.user.userId, dto.decision);
  }

  @Get(':id/booking')
  @ApiOperation({ summary: 'Get booking info' })
  @ApiResponse({ status: 200 })
  async booking(@Param() params: EventIdParamDto) {
    return this.service.bookingInfo(params.id);
  }

  @Post(':id/booking/confirm')
  @ApiOperation({ summary: 'Confirm booking' })
  @ApiResponse({ status: 200 })
  @UseGuards(MembershipGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async confirmBooking(
    @Param() params: EventIdParamDto,
    @Body() dto: BookingConfirmDto,
    @Req() req: any,
  ) {
    return this.service.confirmBooking(
      params.id,
      req.user.userId,
      dto.bookingRef,
    );
  }

  @Get(':id/chat')
  @ApiOperation({ summary: 'Chat history' })
  @ApiResponse({ status: 200 })
  async chatHistory(
    @Param() params: EventIdParamDto,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.service.chatHistory(params.id, cursor, limit);
  }

  @Post(':id/chat')
  @ApiOperation({ summary: 'Send message' })
  @ApiResponse({ status: 201 })
  @UseGuards(MembershipGuard)
  async createMessage(
    @Param() params: EventIdParamDto,
    @Body() dto: CreateMessageDto,
    @Req() req: any,
  ) {
    return this.service.createMessage(params.id, req.user.userId, dto.text);
  }
}
