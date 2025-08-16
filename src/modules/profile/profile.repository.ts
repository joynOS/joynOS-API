import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAttendedEventsCount(userId: string): Promise<number> {
    return this.prisma.member.count({
      where: {
        userId,
        status: { in: ['JOINED', 'COMMITTED'] },
        bookingStatus: 'BOOKED',
        event: {
          endTime: { lt: new Date() }, // event has ended
        },
      },
    });
  }

  async getCircleConnectionsCount(userId: string): Promise<number> {
    return this.prisma.userConnection.count({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: 'ACTIVE',
      },
    });
  }

  async getCommitRate(userId: string): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90); // last 90 days

    const totalMembers = await this.prisma.member.count({
      where: {
        userId,
        joinedAt: { gte: cutoffDate },
      },
    });

    if (totalMembers === 0) return 0;

    const committedMembers = await this.prisma.member.count({
      where: {
        userId,
        joinedAt: { gte: cutoffDate },
        status: 'COMMITTED',
      },
    });

    return committedMembers / totalMembers;
  }

  async getCommitScore(userId: string): Promise<{
    score: number;
    breakdown: {
      attended: number;
      acknowledgedEvents: number;
      unratedEvents: number;
      posBonus: number;
      negPenalty: number;
    };
  }> {
    // Get attended events (ended, member with booked status)
    const attended = await this.prisma.member.findMany({
      where: {
        userId,
        status: { in: ['JOINED', 'COMMITTED'] },
        bookingStatus: 'BOOKED',
        event: { 
          endTime: { lt: new Date() } 
        },
      },
      include: { 
        event: { 
          select: { id: true, endTime: true } 
        } 
      },
      orderBy: { event: { endTime: 'desc' } },
      take: 20, // Last 20 events for performance
    });

    let base = 100;
    let acknowledgedEvents = 0;
    let unratedEvents = 0;

    // Check peer acknowledgements for each attended event
    for (const member of attended) {
      const acknowledgements = await this.prisma.eventReviewPeer.count({
        where: { 
          eventId: member.eventId, 
          peerUserId: userId 
        },
      });
      
      if (acknowledgements > 0) {
        acknowledgedEvents++;
      } else {
        unratedEvents++;
      }
    }

    // Calculate bonuses and penalties
    const posBonus = Math.min(acknowledgedEvents * 2, 10); // Cap at +10
    const negPenalty = unratedEvents * 5;

    let score = base + posBonus - negPenalty;

    // Cold start protection: min 90% for users with <3 events
    if (attended.length < 3) {
      score = Math.max(score, 90);
    }

    // Clamp between 50-100
    score = Math.max(50, Math.min(100, score));

    return {
      score,
      breakdown: {
        attended: attended.length,
        acknowledgedEvents,
        unratedEvents,
        posBonus,
        negPenalty,
      },
    };
  }

  async getAttendedEvents(userId: string, cursor?: string, limit: number = 20) {
    let cursorObj = {};
    if (cursor) {
      cursorObj = { cursor: { id: cursor }, skip: 1 };
    }

    const members = await this.prisma.member.findMany({
      where: {
        userId,
        status: { in: ['JOINED', 'COMMITTED'] },
        bookingStatus: 'BOOKED',
        event: {
          endTime: { lt: new Date() },
        },
      },
      orderBy: [
        { event: { startTime: 'desc' } },
        { id: 'desc' }
      ],
      take: limit + 1,
      ...cursorObj,
      include: {
        event: {
          include: {
            reviews: {
              where: { userId },
              select: {
                placeRating: true,
                planRating: true,
                planId: true,
              },
            },
          },
        },
      },
    });

    const hasMore = members.length > limit;
    const items = hasMore ? members.slice(0, -1) : members;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      items: items.map((member) => ({
        eventId: member.event.id,
        title: member.event.title,
        venue: member.event.venue,
        imageUrl: member.event.imageUrl,
        startTime: member.event.startTime,
        endTime: member.event.endTime,
        myPlaceRating: member.event.reviews[0]?.placeRating || null,
        myPlanRating: member.event.reviews[0]?.planRating || null,
        selectedPlanId: member.event.selectedPlanId,
      })),
      nextCursor,
    };
  }

  async getPlaces(userId: string, cursor?: string, limit: number = 20) {
    // Get unique venues from attended events with aggregated data
    const attendedEvents = await this.prisma.member.findMany({
      where: {
        userId,
        status: { in: ['JOINED', 'COMMITTED'] },
        bookingStatus: 'BOOKED',
        event: {
          endTime: { lt: new Date() },
          venue: { not: null },
        },
      },
      include: {
        event: {
          include: {
            reviews: {
              where: { userId },
              select: { placeRating: true },
            },
          },
        },
      },
      orderBy: [{ event: { startTime: 'desc' } }],
    });

    // Group by venue and aggregate
    const venueMap = new Map();
    
    attendedEvents.forEach((member) => {
      const event = member.event;
      const venue = event.venue;
      
      if (!venueMap.has(venue)) {
        venueMap.set(venue, {
          venue,
          address: event.address,
          lat: event.lat ? parseFloat(event.lat.toString()) : null,
          lng: event.lng ? parseFloat(event.lng.toString()) : null,
          lastVisitedAt: event.startTime,
          visits: 0,
          ratings: [],
        });
      }
      
      const venueData = venueMap.get(venue);
      venueData.visits++;
      
      if (event.startTime && event.startTime > venueData.lastVisitedAt) {
        venueData.lastVisitedAt = event.startTime;
      }
      
      if (event.reviews[0]?.placeRating) {
        venueData.ratings.push(event.reviews[0].placeRating);
      }
    });

    // Convert to array and sort by last visited
    let places = Array.from(venueMap.values())
      .map((place) => ({
        venue: place.venue,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        lastVisitedAt: place.lastVisitedAt,
        visits: place.visits,
        avgPlaceRating: place.ratings.length > 0
          ? place.ratings.reduce((sum, rating) => sum + rating, 0) / place.ratings.length
          : null,
      }))
      .sort((a, b) => new Date(b.lastVisitedAt).getTime() - new Date(a.lastVisitedAt).getTime());

    // Handle pagination
    let startIndex = 0;
    if (cursor) {
      startIndex = places.findIndex(place => place.venue === cursor);
      if (startIndex > -1) startIndex++;
    }

    const items = places.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < places.length;
    const nextCursor = hasMore ? items[items.length - 1].venue : null;

    return { items, nextCursor };
  }

  async getCircleConnections(userId: string, cursor?: string, limit: number = 20) {
    const where = {
      OR: [{ userAId: userId }, { userBId: userId }],
      status: 'ACTIVE' as const,
    };

    let cursorObj = {};
    if (cursor) {
      cursorObj = { cursor: { id: cursor }, skip: 1 };
    }

    const connections = await this.prisma.userConnection.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...cursorObj,
      include: {
        userA: {
          select: {
            id: true,
            name: true,
            avatar: true,
            bio: true,
            embedding: true,
          },
        },
        userB: {
          select: {
            id: true,
            name: true,
            avatar: true,
            bio: true,
            embedding: true,
          },
        },
      },
    });

    const hasMore = connections.length > limit;
    const items = hasMore ? connections.slice(0, -1) : connections;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // Return the other user (not the current user)
    return {
      items: items.map((connection) => {
        const otherUser = connection.userAId === userId ? connection.userB : connection.userA;
        return {
          userId: otherUser.id,
          name: otherUser.name,
          avatar: otherUser.avatar,
          tagline: otherUser.bio || null,
          // Pass full connection for service layer
          connection: {
            userAId: connection.userAId,
            userBId: connection.userBId,
            userA: connection.userA,
            userB: connection.userB,
          },
        };
      }),
      nextCursor,
    };
  }

  async getUserInterests(userId: string) {
    return this.prisma.userInterest.findMany({
      where: { userId },
      include: {
        interest: {
          select: {
            id: true,
            emoji: true,
            label: true,
          },
        },
      },
      orderBy: { interest: { label: 'asc' } },
    });
  }

  async getUserProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        aiProfile: true,
        embedding: true,
      },
    });
  }
}