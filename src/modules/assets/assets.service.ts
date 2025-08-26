import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Readable } from 'stream';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  private readonly googleMapsApiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.googleMapsApiKey =
      this.configService.get<string>('GOOGLE_MAPS_API_KEY') || '';
  }

  async getGooglePlacesPhoto(
    photoReference: string,
    maxSize: number = 800,
  ): Promise<Readable> {
    if (!this.googleMapsApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    const url = `https://maps.googleapis.com/maps/api/place/photo`;
    const params = {
      photoreference: photoReference,
      maxwidth: maxSize.toString(),
      key: this.googleMapsApiKey,
    };

    try {
      this.logger.debug(`Fetching Google Places photo: ${photoReference}`);

      const response = await axios.get(url, {
        params,
        responseType: 'stream',
        timeout: 10000, // 10 second timeout
      });

      return response.data as Readable;
    } catch (error) {
      this.logger.error(
        `Failed to fetch Google Places photo: ${photoReference}`,
        error.message,
      );
      throw new Error(`Failed to fetch photo: ${error.message}`);
    }
  }

  /**
   * Build proxied photo URL for Google Places photo reference
   */
  buildPhotoUrl(photoReference: string, maxSize: number = 800): string {
    const baseUrl =
      this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
    return `${baseUrl}/assets/places-photo?ref=${photoReference}&max=${maxSize}`;
  }

  /**
   * Extract photo reference from Google Places photo URL
   */
  extractPhotoReference(photoUrl: string): string | null {
    const match = photoUrl.match(/[?&]ref=([^&]+)/);
    return match ? match[1] : null;
  }

  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<string> {
    try {
      const uploadDir = join(process.cwd(), 'uploads');
      const filePath = join(uploadDir, filename);

      // Create the full directory path including subdirectories
      const fileDir = dirname(filePath);
      await mkdir(fileDir, { recursive: true });
      await writeFile(filePath, buffer);

      const baseUrl =
        this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
      return `${baseUrl}/assets/uploads/${filename}`;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${filename}`, error.message);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }
}
