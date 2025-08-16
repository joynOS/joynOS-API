import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get profile summary with counts and stats' })
  @ApiResponse({
    status: 200,
    description: 'Profile summary retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        eventsCount: { type: 'number', description: 'Number of attended events' },
        circleCount: { type: 'number', description: 'Number of circle connections' },
        commitRate: { type: 'number', description: 'Commit rate percentage (0-1)' },
        commitScore: { type: 'number', description: 'Peer-based commit score (0-1)' },
        commitBreakdown: {
          type: 'object',
          properties: {
            attended: { type: 'number' },
            acknowledgedEvents: { type: 'number' },
            unratedEvents: { type: 'number' },
            posBonus: { type: 'number' },
            negPenalty: { type: 'number' },
          },
        },
      },
    },
  })
  async getSummary(@Request() req) {
    return this.profileService.getSummary(req.user.userId);
  }

  @Get('attended')
  @ApiOperation({ summary: 'Get attended events with pagination' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items to return' })
  @ApiResponse({
    status: 200,
    description: 'Attended events retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              eventId: { type: 'string' },
              title: { type: 'string' },
              venue: { type: 'string' },
              imageUrl: { type: 'string', nullable: true },
              startTime: { type: 'string', format: 'date-time' },
              endTime: { type: 'string', format: 'date-time' },
              myPlaceRating: { type: 'number', nullable: true },
              myPlanRating: { type: 'number', nullable: true },
              selectedPlanId: { type: 'string', nullable: true },
            },
          },
        },
        nextCursor: { type: 'string', nullable: true },
      },
    },
  })
  async getAttended(
    @Request() req,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.profileService.getAttended(req.user.userId, cursor, limitNum);
  }

  @Get('places')
  @ApiOperation({ summary: 'Get visited places with pagination' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items to return' })
  @ApiResponse({
    status: 200,
    description: 'Visited places retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              venue: { type: 'string' },
              address: { type: 'string', nullable: true },
              lat: { type: 'number', nullable: true },
              lng: { type: 'number', nullable: true },
              lastVisitedAt: { type: 'string', format: 'date-time' },
              visits: { type: 'number' },
              avgPlaceRating: { type: 'number', nullable: true },
            },
          },
        },
        nextCursor: { type: 'string', nullable: true },
      },
    },
  })
  async getPlaces(
    @Request() req,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.profileService.getPlaces(req.user.userId, cursor, limitNum);
  }

  @Get('circle')
  @ApiOperation({ summary: 'Get circle connections with pagination' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items to return' })
  @ApiResponse({
    status: 200,
    description: 'Circle connections retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              name: { type: 'string' },
              avatar: { type: 'string', nullable: true },
              tagline: { type: 'string', nullable: true },
              matchPercent: { type: 'number' },
            },
          },
        },
        nextCursor: { type: 'string', nullable: true },
      },
    },
  })
  async getCircle(
    @Request() req,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.profileService.getCircle(req.user.userId, cursor, limitNum);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get user preferences including interests and plan preferences' })
  @ApiResponse({
    status: 200,
    description: 'User preferences retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        interests: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              emoji: { type: 'string', nullable: true },
              label: { type: 'string' },
            },
          },
        },
        planPreferences: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              title: { type: 'string' },
              subtitle: { type: 'string' },
              matchLabel: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getPreferences(@Request() req) {
    return this.profileService.getPreferences(req.user.userId);
  }
}