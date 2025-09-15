import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface VersionCheckResult {
  updateRequired: boolean;
  forceUpdate: boolean;
  latestVersion: string;
  minimumVersion: string;
  currentVersion: string;
  updateMessage: string;
  downloadUrl?: string;
}

@Injectable()
export class AppVersionService {
  constructor(private readonly configService: ConfigService) {}

  async checkVersion(currentVersion: string, platform: string): Promise<VersionCheckResult> {
    // Get version configurations from environment
    const latestVersion = this.getLatestVersion(platform);
    const minimumVersion = this.getMinimumVersion(platform);
    const downloadUrl = this.getDownloadUrl(platform);

    // Compare versions
    const isUpdateRequired = this.compareVersions(currentVersion, latestVersion) < 0;
    const isForceUpdate = this.compareVersions(currentVersion, minimumVersion) < 0;

    // Generate appropriate message
    let updateMessage = '';
    if (isForceUpdate) {
      updateMessage = 'Esta versão do app não é mais suportada. Atualize agora para continuar usando o JoynOS.';
    } else if (isUpdateRequired) {
      updateMessage = 'Uma nova versão está disponível! Atualize para ter acesso às últimas funcionalidades.';
    } else {
      updateMessage = 'Você está usando a versão mais recente do app!';
    }

    return {
      updateRequired: isUpdateRequired,
      forceUpdate: isForceUpdate,
      latestVersion,
      minimumVersion,
      currentVersion,
      updateMessage,
      downloadUrl: downloadUrl || undefined,
    };
  }

  private getLatestVersion(platform: string): string {
    const key = `APP_LATEST_VERSION_${platform.toUpperCase()}`;
    return this.configService.get(key, this.configService.get('APP_LATEST_VERSION', '1.0.0'));
  }

  private getMinimumVersion(platform: string): string {
    const key = `APP_MINIMUM_VERSION_${platform.toUpperCase()}`;
    return this.configService.get(key, this.configService.get('APP_MINIMUM_VERSION', '1.0.0'));
  }

  private getDownloadUrl(platform: string): string | null {
    const key = `APP_DOWNLOAD_URL_${platform.toUpperCase()}`;
    const defaultUrls: Record<string, string> = {
      ios: 'https://apps.apple.com/app/joynos',
      android: 'https://play.google.com/store/apps/details?id=com.joynos.app',
      web: 'https://app.joynos.com'
    };

    return this.configService.get(key) || defaultUrls[platform.toLowerCase()] || null;
  }

  /**
   * Compare two semantic versions (e.g., "1.2.3")
   * Returns:
   * - negative number if version1 < version2
   * - 0 if version1 = version2
   * - positive number if version1 > version2
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    // Pad with zeros if different lengths
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    while (v1Parts.length < maxLength) v1Parts.push(0);
    while (v2Parts.length < maxLength) v2Parts.push(0);

    for (let i = 0; i < maxLength; i++) {
      if (v1Parts[i] < v2Parts[i]) return -1;
      if (v1Parts[i] > v2Parts[i]) return 1;
    }

    return 0;
  }
}