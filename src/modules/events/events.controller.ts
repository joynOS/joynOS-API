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
  CreateReviewDto,
} from './dto';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly service: EventsService) {}

  @Get('my')
  @ApiOperation({ summary: 'My events' })
  @ApiResponse({ status: 200 })
  async my(@Req() req: any) {
    return this.service.myEvents(req.user?.userId);
  }

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
  async browse(@Query() query: BrowseEventsQueryDto, @Req() req: any) {
    return this.service.browse({
      ...query,
      userId: req.user?.userId,
    } as any);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Event detail' })
  @ApiResponse({ status: 200 })
  async detail(@Param() params: EventIdParamDto, @Req() req: any) {
    const data = await this.service.detail(params.id, req.user?.userId);
    let isMember = false;
    if (req?.user?.userId) {
      const prisma = (this as any).service.repo.prisma as any;
      const m = await prisma.member.findUnique({
        where: {
          eventId_userId: { eventId: params.id, userId: req.user.userId },
        },
      });
      isMember = !!m;
    }
    return { ...data, isMember };
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
  async booking(@Param() params: EventIdParamDto, @Req() req: any) {
    return this.service.bookingInfo(params.id, req.user?.userId);
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
    @Req() req: any,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.service.chatHistory(params.id, cursor, limit, req.user?.userId);
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

  @Get(':id/review')
  @ApiOperation({ summary: 'Get my review for this event' })
  @ApiResponse({
    status: 200,
    description: 'Review retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        userId: { type: 'string' },
        placeRating: { type: 'number' },
        planRating: { type: 'number' },
        planId: { type: 'string', nullable: true },
        comment: { type: 'string', nullable: true },
        connectedUserIds: { type: 'array', items: { type: 'string' } },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async getReview(@Param() params: EventIdParamDto, @Req() req: any) {
    return await this.service.getReview(params.id, req.user.userId);
  }

  @Get(':id/chat/suggestions')
  @ApiOperation({ summary: 'Get chat suggestions for event' })
  @ApiResponse({
    status: 200,
    description: 'Chat suggestions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          items: { type: 'string' },
        },
        context: { type: 'string' },
      },
    },
  })
  @UseGuards(MembershipGuard)
  async chatSuggestions(@Param() params: EventIdParamDto, @Req() req: any) {
    return await this.service.generateChatSuggestions(
      params.id,
      req.user.userId,
    );
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Submit event review' })
  @ApiResponse({
    status: 201,
    description: 'Review created successfully',
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        review: {
          type: 'object',
          properties: {
            eventId: { type: 'string' },
            userId: { type: 'string' },
            placeRating: { type: 'number' },
            planRating: { type: 'number' },
            planId: { type: 'string', nullable: true },
            comment: { type: 'string', nullable: true },
            connectedUserIds: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        circleAdded: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - event not ended or invalid data',
  })
  @UseInterceptors(IdempotencyInterceptor)
  async createReview(
    @Param() params: EventIdParamDto,
    @Body() dto: CreateReviewDto,
    @Req() req: any,
  ) {
    return await this.service.createReview(params.id, req.user.userId, dto);
  }
}
