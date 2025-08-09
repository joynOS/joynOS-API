import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class SignUpDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() password: string;
  @ApiProperty() @IsString() name: string;
}

export class SignInDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() password: string;
}

export class UpdateMeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatar?: string;
}

export class PreferencesDto {
  @ApiProperty() @IsNumber() currentLat: number;
  @ApiProperty() @IsNumber() currentLng: number;
  @ApiProperty() @IsNumber() radiusMiles: number;
}

export class UserInterestsDto {
  @ApiProperty({ type: [String] }) @IsArray() interestIds: string[];
}
