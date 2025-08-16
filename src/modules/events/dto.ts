import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  BookingStatus,
  MemberStatus,
  VotingState,
} from '../../common/constants/domain.constants';

export class RecommendationsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  categories?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() radiusMiles?: number;
}

export class JoinEventResponseDto {
  @ApiProperty({ enum: MemberStatus }) memberStatus: MemberStatus;
  @ApiProperty({ enum: BookingStatus }) bookingStatus: BookingStatus;
  @ApiProperty({ enum: VotingState }) votingState: VotingState;
  @ApiPropertyOptional() votingEndsAt?: string;
}

export class CommitDto {
  @ApiProperty({ enum: ['IN', 'OUT'] })
  @IsString()
  @IsIn(['IN', 'OUT'])
  decision: 'IN' | 'OUT';
}

export class BookingConfirmDto {
  @ApiPropertyOptional() @IsOptional() @IsString() bookingRef?: string;
}

export class CreateMessageDto {
  @ApiProperty() @IsString() text: string;
}

export class VotePathDto {
  @ApiProperty() @IsString() planId: string;
}

export class EventIdParamDto {
  @ApiProperty() @IsString() id: string;
}

export class BrowseEventsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  tags?: string[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  take?: number;
}

export class PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateReviewDto {
  @ApiProperty({
    description: 'Rating for the place (1-5)',
    minimum: 1,
    maximum: 5,
    type: 'integer',
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  placeRating: number;

  @ApiProperty({
    description: 'Rating for the plan (1-5)',
    minimum: 1,
    maximum: 5,
    type: 'integer',
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  planRating: number;

  @ApiPropertyOptional({
    description: 'Optional comment about the experience',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({
    description: 'Array of user IDs that the reviewer connected with',
    type: [String],
    default: [],
  })
  @IsArray()
  @IsString({ each: true })
  connectedUserIds: string[];
}
