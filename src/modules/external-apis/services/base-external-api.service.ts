import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  ExternalAPIProvider,
  SearchParams,
  ExternalEventRaw,
} from '../interfaces/external-event.interface';
import { EventSource } from '../enums/event-source.enum';

@Injectable()
export abstract class BaseExternalAPIService implements ExternalAPIProvider {
  protected readonly logger: Logger;
  protected readonly httpClient: AxiosInstance;
  protected readonly configService: ConfigService;

  abstract readonly name: string;
  abstract readonly source: EventSource;

  constructor(configService: ConfigService) {
    this.configService = configService;
    this.logger = new Logger(this.constructor.name);
    this.httpClient = this.createHttpClient();
  }

  protected createHttpClient(): AxiosInstance {
    const client = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'JoynOS-API/1.0',
      },
    });

    // Request interceptor for logging
    client.interceptors.request.use((config) => {
      this.logger.debug(`${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // Response interceptor for error handling
    client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error(`API Error: ${error.message}`, error.response?.data);
        throw error;
      },
    );

    return client;
  }

  protected async makeRequest<T>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await this.httpClient.request<T>({
        url,
        ...config,
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Request failed for ${this.name}: ${error.message}`);
      throw error;
    }
  }

  protected abstract getApiKey(): string;

  abstract searchEvents(params: SearchParams): Promise<ExternalEventRaw[]>;

  abstract isEnabled(): boolean;

  protected filterByDateRange(
    events: ExternalEventRaw[],
    startDate?: Date,
    endDate?: Date,
  ): ExternalEventRaw[] {
    return events.filter((event) => {
      if (startDate && event.startTime < startDate) return false;
      if (endDate && event.startTime > endDate) return false;
      return true;
    });
  }

  protected limitResults(
    events: ExternalEventRaw[],
    limit?: number,
  ): ExternalEventRaw[] {
    return limit ? events.slice(0, limit) : events;
  }

  protected calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  protected filterByRadius(
    events: ExternalEventRaw[],
    centerLat: number,
    centerLng: number,
    radiusMeters: number,
  ): ExternalEventRaw[] {
    return events.filter((event) => {
      if (!event.lat || !event.lng) return true; // Keep events without location
      const distance = this.calculateDistance(
        centerLat,
        centerLng,
        event.lat,
        event.lng,
      );
      return distance <= radiusMeters;
    });
  }
}
