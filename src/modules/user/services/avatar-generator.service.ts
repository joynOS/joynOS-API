import { Injectable, Logger } from '@nestjs/common';

interface AvatarSpec {
  description: string;
  style: string;
  ethnicity: string;
  hairColor: string;
  outfit: string;
}

@Injectable()
export class AvatarGeneratorService {
  private readonly logger = new Logger(AvatarGeneratorService.name);

  generateAvatarUrl(spec: AvatarSpec, size: number = 150): string {
    const seed = this.generateSeedFromSpec(spec);
    const style = this.mapToAvatarStyle(spec.style, spec.ethnicity);

    return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}&size=${size}&backgroundColor=transparent&radius=50`;
  }

  generateFemaleAvatarUrl(spec: AvatarSpec, size: number = 150): string {
    const seed = this.generateSeedFromSpec(spec);

    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&size=${size}&backgroundColor=transparent&radius=50&top[]=${this.getHairStyle(spec.hairColor)}&hairColor[]=${this.getHairColor(spec.hairColor)}&skinColor[]=${this.getSkinColor(spec.ethnicity)}&clothingColor[]=${this.getClothingColor(spec.outfit)}&accessories[]=blank&facialHair[]=blank`;
  }

  generateRealisticAvatarSet(
    users: Array<{
      name: string;
      avatar: AvatarSpec;
    }>,
  ): Array<{
    name: string;
    avatarUrl: string;
    thumbnailUrl: string;
  }> {
    return users.map((user) => ({
      name: user.name,
      avatarUrl: this.generateFemaleAvatarUrl(user.avatar, 200),
      thumbnailUrl: this.generateFemaleAvatarUrl(user.avatar, 80),
    }));
  }

  private generateSeedFromSpec(spec: AvatarSpec): string {
    const combined = `${spec.description}-${spec.style}-${spec.ethnicity}-${spec.hairColor}`;
    return combined
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  private mapToAvatarStyle(style: string, ethnicity: string): string {
    const styles = ['avataaars', 'big-smile', 'personas'];

    if (style.toLowerCase().includes('professional')) return 'personas';
    if (style.toLowerCase().includes('casual')) return 'avataaars';
    if (style.toLowerCase().includes('artistic')) return 'big-smile';

    return 'avataaars';
  }

  private getHairStyle(hairColor: string): string {
    const styles = [
      'longHairBigHair',
      'longHairCurly',
      'longHairCurvy',
      'longHairDreads',
      'longHairFro',
      'longHairMiaWallace',
      'longHairNotTooLong',
      'longHairStraight',
      'longHairStraight2',
      'longHairStraightStrand',
    ];
    return styles[Math.floor(Math.random() * styles.length)];
  }

  private getHairColor(hairColor: string): string {
    const colorMap: Record<string, string> = {
      brown: 'brown',
      black: 'black',
      blonde: 'blonde',
      red: 'red',
      auburn: 'auburn',
      gray: 'silverGray',
    };

    return colorMap[hairColor.toLowerCase()] || 'brown';
  }

  private getSkinColor(ethnicity: string): string {
    const colorMap: Record<string, string> = {
      caucasian: 'light',
      asian: 'yellow',
      hispanic: 'brown',
      black: 'darkBrown',
      'african american': 'darkBrown',
      'middle eastern': 'brown',
      mixed: 'brown',
    };

    return colorMap[ethnicity.toLowerCase()] || 'light';
  }

  private getClothingColor(outfit: string): string {
    if (outfit.toLowerCase().includes('professional')) return 'blue01';
    if (outfit.toLowerCase().includes('casual')) return 'gray01';
    if (outfit.toLowerCase().includes('artistic')) return 'red';
    if (outfit.toLowerCase().includes('trendy')) return 'black';

    return 'blue01';
  }

  generateWomanProfileStats(): {
    eventsAttended: number;
    circleSize: number;
    commitRate: number;
    joinedDate: string;
    badges: string[];
  } {
    return {
      eventsAttended: Math.floor(Math.random() * 15) + 15,
      circleSize: Math.floor(Math.random() * 10) + 10,
      commitRate: Math.floor(Math.random() * 20) + 85,
      joinedDate: this.generateRecentJoinDate(),
      badges: this.generateUserBadges(),
    };
  }

  private generateRecentJoinDate(): string {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthsAgo = Math.floor(Math.random() * 8) + 2;
    const currentMonth = new Date().getMonth();
    const joinMonth = (currentMonth - monthsAgo + 12) % 12;

    return `${months[joinMonth]} 2024`;
  }

  private generateUserBadges(): string[] {
    const allBadges = [
      'Early Adopter',
      'Social Butterfly',
      'Adventure Seeker',
      'Culture Lover',
      'Foodie Explorer',
      'Night Owl',
      'Weekend Warrior',
      'Plan Pioneer',
    ];

    const numBadges = Math.floor(Math.random() * 3) + 2;
    return allBadges.sort(() => 0.5 - Math.random()).slice(0, numBadges);
  }
}
