import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { AssetsService } from './assets.service';

@ApiTags('Assets')
@Controller('assets')
export class AssetsController {
  private readonly logger = new Logger(AssetsController.name);

  constructor(private readonly assetsService: AssetsService) {}

  @Get('places-photo')
  @ApiOperation({ summary: 'Proxy for Google Places Photo API' })
  @ApiQuery({ name: 'ref', description: 'Google Places photo reference' })
  @ApiQuery({
    name: 'max',
    description: 'Maximum width or height',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Image stream' })
  @ApiResponse({ status: 400, description: 'Missing photo reference' })
  @ApiResponse({ status: 404, description: 'Photo not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getPlacesPhoto(
    @Query('ref') photoReference: string,
    @Query('max') maxSize: string = '800',
    @Res() res: Response,
  ) {
    if (!photoReference) {
      this.logger.warn('Photo proxy request without reference parameter');
      throw new HttpException(
        'Photo reference is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const maxSizeNum = parseInt(maxSize, 10);
    if (isNaN(maxSizeNum) || maxSizeNum < 1 || maxSizeNum > 1600) {
      this.logger.warn(`Invalid max size parameter: ${maxSize}`);
      throw new HttpException(
        'Max size must be a number between 1 and 1600',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      this.logger.debug(
        `Proxying photo request: ref=${photoReference}, max=${maxSizeNum}`,
      );

      const imageStream = await this.assetsService.getGooglePlacesPhoto(
        photoReference,
        maxSizeNum,
      );

      // Set proper headers for image response
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // Cache for 24 hours
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');

      // Handle stream errors
      imageStream.on('error', (streamError) => {
        this.logger.error(
          `Image stream error for ${photoReference}:`,
          streamError.message,
        );
        if (!res.headersSent) {
          res.status(HttpStatus.NOT_FOUND).json({
            error: 'Photo not found',
            reference: photoReference,
          });
        }
      });

      imageStream.pipe(res);
    } catch (error) {
      this.logger.error(
        `Failed to fetch photo ${photoReference}:`,
        error.message,
      );

      if (
        error.message?.includes('INVALID_REQUEST') ||
        error.message?.includes('NOT_FOUND')
      ) {
        throw new HttpException(
          `Photo not found: ${photoReference}`,
          HttpStatus.NOT_FOUND,
        );
      }

      throw new HttpException(
        'Failed to fetch photo',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
