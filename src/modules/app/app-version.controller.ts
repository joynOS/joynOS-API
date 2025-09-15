import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AppVersionService } from './app-version.service';

@ApiTags('App Version')
@Controller('app')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Get('version-check')
  @ApiOperation({
    summary: 'Check if app version needs update',
    description:
      'Compares current app version with minimum required version and latest version',
  })
  @ApiQuery({
    name: 'version',
    required: true,
    type: String,
    description: 'Current app version (e.g., "1.2.3")',
    example: '1.0.0',
  })
  @ApiQuery({
    name: 'platform',
    required: false,
    type: String,
    description: 'Platform: ios, android, web',
    example: 'ios',
  })
  @ApiResponse({
    status: 200,
    description: 'Version check result',
    schema: {
      type: 'object',
      properties: {
        updateRequired: {
          type: 'boolean',
          description: 'Whether any update is needed',
        },
        forceUpdate: {
          type: 'boolean',
          description: 'Whether update is mandatory',
        },
        latestVersion: {
          type: 'string',
          description: 'Latest available version',
        },
        minimumVersion: {
          type: 'string',
          description: 'Minimum supported version',
        },
        currentVersion: {
          type: 'string',
          description: 'Version sent by client',
        },
        updateMessage: {
          type: 'string',
          description: 'Message to show to user',
        },
        downloadUrl: {
          type: 'string',
          description: 'Where to download update',
        },
      },
    },
  })
  async checkVersion(
    @Query('version') version: string,
    @Query('platform') platform?: string,
  ) {
    return await this.appVersionService.checkVersion(
      version,
      platform || 'unknown',
    );
  }
}
