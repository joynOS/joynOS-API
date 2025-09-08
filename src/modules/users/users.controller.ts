import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PreferencesDto, UpdateMeDto, UserInterestsDto } from './dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user' })
  @ApiResponse({ status: 200 })
  async me(@Req() req: any) {
    return this.service.me(req.user.userId);
  }

  @Patch('me')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update profile with optional photo upload' })
  @ApiResponse({ status: 200 })
  async update(
    @Req() req: any,
    @Body() dto: UpdateMeDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.service.update(req.user.userId, dto, avatar);
  }

  @Put('me/preferences')
  @ApiOperation({ summary: 'Update preferences' })
  @ApiResponse({ status: 200 })
  async updatePreferences(@Req() req: any, @Body() dto: PreferencesDto) {
    return this.service.updatePreferences(req.user.userId, dto);
  }

  @Put('me/interests')
  @ApiOperation({ summary: 'Set interests' })
  @ApiResponse({ status: 200 })
  async setInterests(@Req() req: any, @Body() dto: UserInterestsDto) {
    return this.service.setInterests(req.user.userId, dto);
  }
}
