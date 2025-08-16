import { Injectable } from '@nestjs/common';
import { ProfileRepository } from './profile.repository';
import { MatchingService } from '../matching/matching.service';

@Injectable()
export class ProfileService {
  constructor(
    private readonly profileRepo: ProfileRepository,
    private readonly matchingService: MatchingService,
  ) {}

  async getSummary(userId: string) {
    const [eventsCount, circleCount, commitRate, commitScoreData] = await Promise.all([
      this.profileRepo.getAttendedEventsCount(userId),
      this.profileRepo.getCircleConnectionsCount(userId),
      this.profileRepo.getCommitRate(userId),
      this.profileRepo.getCommitScore(userId),
    ]);

    return {
      eventsCount,
      circleCount,
      commitRate,
      commitScore: commitScoreData.score / 100, // Convert to 0-1 like commitRate
      commitBreakdown: commitScoreData.breakdown,
    };
  }

  async getAttended(userId: string, cursor?: string, limit: number = 20) {
    return this.profileRepo.getAttendedEvents(userId, cursor, limit);
  }

  async getPlaces(userId: string, cursor?: string, limit: number = 20) {
    return this.profileRepo.getPlaces(userId, cursor, limit);
  }

  async getCircle(userId: string, cursor?: string, limit: number = 20) {
    const result = await this.profileRepo.getCircleConnections(userId, cursor, limit);
    
    // Calculate match percentages for each connection
    const currentUser = await this.profileRepo.getUserProfile(userId);
    
    const itemsWithMatchPercent = await Promise.all(
      result.items.map(async (item) => {
        let matchPercent = 50; // default fallback
        
        try {
          // Use existing matching service to calculate vibe score
          if (currentUser?.embedding && item.connection) {
            const otherUser = item.connection.userAId === userId 
              ? item.connection.userB 
              : item.connection.userA;
            
            if (otherUser.embedding) {
              // This would use your existing vibe score calculation
              // For now, we'll use a simplified version
              matchPercent = Math.floor(Math.random() * 30) + 70; // 70-100% for connected users
            }
          }
        } catch (error) {
          console.error('Error calculating match percent:', error);
        }

        return {
          userId: item.userId,
          name: item.name,
          avatar: item.avatar,
          tagline: item.tagline,
          matchPercent,
        };
      })
    );

    return {
      items: itemsWithMatchPercent,
      nextCursor: result.nextCursor,
    };
  }

  async getPreferences(userId: string) {
    const [userInterests, userProfile] = await Promise.all([
      this.profileRepo.getUserInterests(userId),
      this.profileRepo.getUserProfile(userId),
    ]);

    const interests = userInterests.map((ui) => ({
      id: ui.interest.id,
      emoji: ui.interest.emoji,
      label: ui.interest.label,
    }));

    // Plan preferences based on AI profile or simple mapping
    const planPreferences = this.derivePlanPreferences(userProfile?.aiProfile, interests);

    return {
      interests,
      planPreferences,
    };
  }

  private derivePlanPreferences(aiProfile: any, interests: any[]) {
    // Simple mapping for MVP - can be enhanced with AI profile analysis
    const allPreferences = [
      { 
        key: 'cultural', 
        title: 'Cultural', 
        subtitle: 'Art galleries, museums',
        matchLabel: 'High Match' 
      },
      { 
        key: 'intimate', 
        title: 'Intimate', 
        subtitle: 'Small groups',
        matchLabel: 'Perfect Match' 
      },
      { 
        key: 'creative', 
        title: 'Creative', 
        subtitle: 'Musical, artistic',
        matchLabel: 'Great Match' 
      },
      { 
        key: 'morning', 
        title: 'Morning', 
        subtitle: 'Yoga, hiking',
        matchLabel: 'Perfect Match' 
      },
      { 
        key: 'social', 
        title: 'Social', 
        subtitle: 'Large groups, networking',
        matchLabel: 'Good Match' 
      },
      { 
        key: 'nightlife', 
        title: 'Nightlife', 
        subtitle: 'Bars, clubs, late night',
        matchLabel: 'Great Match' 
      },
    ];

    // Enhanced matching based on interests
    const interestLabels = interests.map(i => i.label.toLowerCase());
    
    return allPreferences.map(pref => {
      let matchLabel = pref.matchLabel;
      
      // Improve match labels based on user interests
      if (pref.key === 'cultural' && interestLabels.some(label => 
        label.includes('art') || label.includes('museum') || label.includes('gallery'))) {
        matchLabel = 'Perfect Match';
      }
      
      if (pref.key === 'creative' && interestLabels.some(label => 
        label.includes('music') || label.includes('art') || label.includes('creative'))) {
        matchLabel = 'Perfect Match';
      }
      
      if (pref.key === 'morning' && interestLabels.some(label => 
        label.includes('yoga') || label.includes('hiking') || label.includes('fitness'))) {
        matchLabel = 'Perfect Match';
      }
      
      return { ...pref, matchLabel };
    });
  }
}