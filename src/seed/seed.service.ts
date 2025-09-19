import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AIService } from '../modules/ai/ai.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
  ) {}

  async seedAll() {
    this.logger.log('🌱 Starting complete seed process...');

    try {
      // 1. Create interests if they don't exist
      await this.seedInterests();

      // 2. Create main user and similar women users
      await this.seedUsers();

      // 3. Create social connections (Emma's circle)
      await this.seedSocialConnections();

      // 4. Create historical events with your participation (57 events)
      await this.seedHistoricalEventsForUser(
        '628b2526-05e7-4556-b6c8-e94d4c92a16b',
      );

      // 5. Create current/upcoming events with simulated Ticketmaster data
      await this.seedEvents();

      this.logger.log('✅ Seed completed successfully!');
    } catch (error) {
      this.logger.error('❌ Seed failed:', error.message);
      throw error;
    }
  }

  async seedQuiz() {
    this.logger.log('🧠 Seeding quiz questions...');

    try {
      const QUIZ_QUESTIONS = [
        {
          id: 1,
          image: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&h=600&fit=crop',
          question: "At a party, you're most likely to be:",
          answers: [
            { id: 'a', text: 'The DJ controlling the music and energy', archetype: 'energetic' },
            { id: 'b', text: 'Deep in conversation with one fascinating person', archetype: 'thoughtful' },
            { id: 'c', text: "The host making sure everyone's having fun", archetype: 'connector' },
            { id: 'd', text: 'Observing the social dynamics from a cozy corner', archetype: 'observer' },
          ],
        },
        {
          id: 2,
          image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&h=600&fit=crop',
          question: 'Your ideal vacation is:',
          answers: [
            { id: 'a', text: 'Backpacking through unexplored places with no set plans', archetype: 'adventurer' },
            { id: 'b', text: 'A detailed itinerary hitting all the must-see spots', archetype: 'planner' },
            { id: 'c', text: 'Somewhere you can help locals or volunteer', archetype: 'helper' },
            { id: 'd', text: 'A peaceful retreat where you can think and recharge', archetype: 'contemplative' },
          ],
        },
        {
          id: 3,
          image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop',
          question: 'When making decisions, you:',
          answers: [
            { id: 'a', text: 'Go with your gut immediately', archetype: 'intuitive' },
            { id: 'b', text: 'Research every possible angle first', archetype: 'analytical' },
            { id: 'c', text: 'Consider how it affects everyone involved', archetype: 'empathetic' },
            { id: 'd', text: 'Follow a logical system or framework', archetype: 'systematic' },
          ],
        },
        {
          id: 4,
          image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&h=600&fit=crop',
          question: 'Your friends describe you as:',
          answers: [
            { id: 'a', text: 'The one who makes things happen', archetype: 'catalyst' },
            { id: 'b', text: 'The one who keeps everyone grounded', archetype: 'stabilizer' },
            { id: 'c', text: "The one who remembers everyone's birthdays", archetype: 'caretaker' },
            { id: 'd', text: 'The one with the most interesting ideas', archetype: 'innovator' },
          ],
        },
        {
          id: 5,
          image: 'https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=800&h=600&fit=crop',
          question: 'Under pressure, you:',
          answers: [
            { id: 'a', text: 'Thrive and get energized by the challenge', archetype: 'challenger' },
            { id: 'b', text: 'Stay calm and work through it systematically', archetype: 'steady' },
            { id: 'c', text: 'Rally everyone together as a team', archetype: 'unifier' },
            { id: 'd', text: 'Need quiet time to process and plan', archetype: 'processor' },
          ],
        },
        {
          id: 6,
          image: 'https://images.unsplash.com/photo-1497032628192-86f99bcd76bc?w=800&h=600&fit=crop',
          question: 'Your ideal work environment is:',
          answers: [
            { id: 'a', text: 'Fast-paced with lots of variety and interaction', archetype: 'dynamic' },
            { id: 'b', text: 'Stable with clear expectations and processes', archetype: 'structured' },
            { id: 'c', text: 'Collaborative with opportunities to help others', archetype: 'collaborative' },
            { id: 'd', text: 'Independent with time for deep thinking', archetype: 'independent' },
          ],
        },
        {
          id: 7,
          image: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&h=600&fit=crop',
          question: "You're most proud of:",
          answers: [
            { id: 'a', text: 'Taking risks that paid off big', archetype: 'risk-taker' },
            { id: 'b', text: 'Building something lasting and reliable', archetype: 'builder' },
            { id: 'c', text: "Making a positive difference in someone's life", archetype: 'impact-maker' },
            { id: 'd', text: "Solving a complex problem others couldn't", archetype: 'problem-solver' },
          ],
        },
        {
          id: 8,
          image: 'https://images.unsplash.com/photo-1573164713712-03790a178651?w=800&h=600&fit=crop',
          question: 'Your secret superpower is:',
          answers: [
            { id: 'a', text: 'Reading the room and knowing what people need', archetype: 'empath' },
            { id: 'b', text: 'Seeing patterns others miss', archetype: 'pattern-matcher' },
            { id: 'c', text: 'Getting people excited about possibilities', archetype: 'inspirer' },
            { id: 'd', text: "Staying level-headed when everything's chaos", archetype: 'anchor' },
          ],
        },
      ];

      const quiz = await this.prisma.quiz.upsert({
        where: { key: 'onboarding-v1' },
        update: { isActive: true, title: 'Onboarding Quiz' },
        create: { key: 'onboarding-v1', title: 'Onboarding Quiz', isActive: true },
      });

      await this.prisma.quizQuestion.deleteMany({ where: { quizId: quiz.id } });

      for (const q of QUIZ_QUESTIONS) {
        const question = await this.prisma.quizQuestion.create({
          data: {
            quizId: quiz.id,
            order: q.id,
            imageUrl: q.image,
            question: q.question,
          },
        });

        for (const a of q.answers) {
          await this.prisma.quizAnswer.create({
            data: {
              questionId: question.id,
              key: a.id,
              text: a.text,
              archetype: a.archetype,
            },
          });
        }
      }

      this.logger.log('✅ Quiz seeded successfully!');
    } catch (error) {
      this.logger.error('❌ Quiz seed failed:', error.message);
      throw error;
    }
  }

  private async seedInterests() {
    this.logger.log('📚 Seeding interests...');

    const interests = [
      { slug: 'jazz-music', label: 'Jazz Music' },
      { slug: 'live-music', label: 'Live Music' },
      { slug: 'theater', label: 'Theater' },
      { slug: 'art-galleries', label: 'Art Galleries' },
      { slug: 'wine-tasting', label: 'Wine Tasting' },
      { slug: 'food-tours', label: 'Food Tours' },
      { slug: 'museums', label: 'Museums' },
      { slug: 'gaming', label: 'Gaming' },
      { slug: 'karaoke', label: 'Karaoke' },
      { slug: 'games', label: 'Games' },
      { slug: 'running', label: 'Running' },
      { slug: 'hiking', label: 'Hiking' },
      { slug: 'photography', label: 'Photography' },
      { slug: 'meditation', label: 'Meditation' },
      { slug: 'travel', label: 'Travel' },
      { slug: 'comedy-shows', label: 'Comedy Shows' },
      { slug: 'beach-days', label: 'Beach Days' },
      { slug: 'cooking', label: 'Cooking' },
      { slug: 'gardening', label: 'Gardening' },
    ];

    for (const interest of interests) {
      await this.prisma.interest.upsert({
        where: { slug: interest.slug },
        update: {},
        create: interest,
      });
    }

    this.logger.log(`✅ Created ${interests.length} interests`);
  }

  private async seedUsers() {
    this.logger.log('👩 Seeding users...');

    const womenUsers = [
      {
        email: 'sofia.martinez@email.com',
        password: 'password',
        name: 'Sofia Martinez',
        bio: 'Creative director passionate about art, music, and discovering hidden NYC gems',
        interests: [
          'art-galleries',
          'live-music',
          'photography',
          'wine-tasting',
          'museums',
        ],
      },
      {
        email: 'emma.chen@email.com',
        password: 'password',
        name: 'Emma Chen',
        bio: 'Photographer and food lover exploring the cultural heartbeat of New York',
        interests: [
          'photography',
          'food-tours',
          'live-music',
          'travel',
          'cooking',
        ],
      },
      {
        email: 'maya.patel@email.com',
        password: 'password',
        name: 'Maya Patel',
        bio: "Digital nomad who finds inspiration in NYC's diverse music and art scenes",
        interests: [
          'travel',
          'live-music',
          'art-galleries',
          'meditation',
          'hiking',
        ],
      },
      {
        email: 'zoe.williams@email.com',
        password: 'password',
        name: 'Zoe Williams',
        bio: 'Wine enthusiast and culture curator always seeking the next great NYC experience',
        interests: [
          'wine-tasting',
          'food-tours',
          'theater',
          'art-galleries',
          'cooking',
        ],
      },
      {
        email: 'aria.johnson@email.com',
        password: 'password',
        name: 'Aria Johnson',
        bio: "Music producer and creative soul who lives for NYC's underground culture",
        interests: [
          'live-music',
          'jazz-music',
          'photography',
          'comedy-shows',
          'karaoke',
        ],
      },
      {
        email: 'luna.garcia@email.com',
        password: 'password',
        name: 'Luna Garcia',
        bio: 'Art director fascinated by the intersection of creativity and culinary arts',
        interests: [
          'art-galleries',
          'museums',
          'food-tours',
          'cooking',
          'wine-tasting',
        ],
      },
      {
        email: 'ivy.thompson@email.com',
        password: 'password',
        name: 'Ivy Thompson',
        bio: "Travel blogger capturing NYC's most photogenic moments and cultural treasures",
        interests: [
          'travel',
          'photography',
          'live-music',
          'food-tours',
          'beach-days',
        ],
      },
      {
        email: 'nova.kim@email.com',
        password: 'password',
        name: 'Nova Kim',
        bio: 'Wellness coach who balances city adventures with mindful experiences',
        interests: [
          'meditation',
          'hiking',
          'photography',
          'cooking',
          'museums',
        ],
      },
    ];

    for (const userData of womenUsers) {
      await this.createUser(userData);
    }

    this.logger.log(`✅ Created ${womenUsers.length + 1} users`);
  }

  private async createUser(userData: {
    email: string;
    password: string;
    name: string;
    bio: string;
    interests: string[];
  }) {
    const passwordHash = await bcrypt.hash(userData.password, 10);

    const user = await this.prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        passwordHash,
        name: userData.name,
        bio: userData.bio,
        avatar: this.generateAvatarUrl(userData.name),
      },
    });

    // Add user interests
    const interests = await this.prisma.interest.findMany({
      where: { slug: { in: userData.interests } },
    });

    for (const interest of interests) {
      await this.prisma.userInterest.upsert({
        where: {
          userId_interestId: {
            userId: user.id,
            interestId: interest.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          interestId: interest.id,
          weight: Math.floor(Math.random() * 3) + 3, // Random weight 3-5
        },
      });
    }

    // Generate realistic mock embedding for user matching (API quota fallback)
    const interestLabels = interests.map((i) => i.label).join(', ');
    const userEmbeddingText = `${userData.name}\n${userData.bio}\nInterests: ${interestLabels}`;
    const userEmbedding = this.generateMockEmbedding(userEmbeddingText);
    const userEmbeddingBuffer = Buffer.from(
      Float32Array.from(userEmbedding).buffer,
    );

    // Update user with embedding
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        embedding: userEmbeddingBuffer,
      },
    });

    return updatedUser;
  }

  private generateAvatarUrl(name: string): string {
    // Use real photos from Unsplash for realistic women portraits
    const realPhotos = [
      'https://images.unsplash.com/photo-1494790108755-2616c43f40cc?w=400&h=400&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=400&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400&h=400&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=400&h=400&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=400&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1546967191-fdfb13ed6b1e?w=400&h=400&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=400&h=400&fit=crop&crop=face',
    ];

    // Use name hash to consistently assign the same photo to the same user
    const nameHash = name
      .split('')
      .reduce((hash, char) => hash + char.charCodeAt(0), 0);
    return realPhotos[nameHash % realPhotos.length];
  }

  private async seedSocialConnections() {
    this.logger.log("🤝 Creating Emma's social circle...");

    // Find Emma Chen
    const emma = await this.prisma.user.findUnique({
      where: { email: 'emma.chen@email.com' },
    });

    if (!emma) {
      this.logger.warn('Emma Chen not found, skipping social connections');
      return;
    }

    // Get all other users to connect with Emma
    const allUsers = await this.prisma.user.findMany({
      where: { email: { not: 'emma.chen@email.com' } },
    });

    let connectionsCreated = 0;
    for (const user of allUsers) {
      try {
        await this.prisma.userConnection.create({
          data: {
            userAId: emma.id,
            userBId: user.id,
            status: 'ACTIVE',
          },
        });
        connectionsCreated++;
      } catch (error) {
        // Connection might already exist, continue
      }
    }

    this.logger.log(
      `✅ Created ${connectionsCreated} social connections for Emma`,
    );
  }

  private async seedHistoricalEvents() {
    this.logger.log(
      "📅 Creating historical events with Emma's participation...",
    );

    // Find Emma Chen
    const emma = await this.prisma.user.findUnique({
      where: { email: 'emma.chen@email.com' },
    });

    if (!emma) {
      this.logger.warn('Emma Chen not found, skipping historical events');
      return;
    }

    const historicalEvents = [
      {
        title: 'Brooklyn Art Gallery Opening',
        description:
          'Exclusive preview of contemporary artists featuring emerging photographers from NYC',
        imageUrl:
          'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&h=600&fit=crop&crop=center',
        gallery: [
          'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&h=600&fit=crop&crop=center',
          'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=600&fit=crop&crop=center',
          'https://images.unsplash.com/photo-1571115764595-644a1f56a55c?w=800&h=600&fit=crop&crop=center',
        ],
        venue: 'Brooklyn Art Space',
        address: '123 Atlantic Ave, Brooklyn, NY',
        vibeKey: 'ARTSY',
        startTime: new Date('2024-07-15T18:00:00'),
        endTime: new Date('2024-07-15T22:00:00'),
        category: 'art',
      },
      {
        title: 'Rooftop Jazz & Wine Night',
        description:
          'Intimate jazz performance with wine tasting overlooking Manhattan skyline',
        imageUrl:
          'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=600&fit=crop&crop=center',
        gallery: [
          'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=600&fit=crop&crop=center',
          'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=600&fit=crop&crop=center',
          'https://images.unsplash.com/photo-1556909258-f87e1c77b1d4?w=800&h=600&fit=crop&crop=center',
        ],
        venue: 'Sky Terrace',
        address: '456 Fifth Ave, Manhattan, NY',
        vibeKey: 'DATE_NIGHT',
        startTime: new Date('2024-06-20T19:30:00'),
        endTime: new Date('2024-06-20T23:30:00'),
        category: 'music',
      },
      {
        title: 'Food Photography Workshop',
        description:
          'Hands-on workshop learning professional food photography techniques in trendy restaurant',
        imageUrl:
          'https://images.unsplash.com/photo-1556909114-28e2e5d58e20?w=800&h=600&fit=crop&crop=center',
        gallery: [
          'https://images.unsplash.com/photo-1556909114-28e2e5d58e20?w=800&h=600&fit=crop&crop=center',
          'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=800&h=600&fit=crop&crop=center',
          'https://images.unsplash.com/photo-1556909114-b31c34b1bb10?w=800&h=600&fit=crop&crop=center',
        ],
        venue: 'The Photography Studio',
        address: '789 Soho St, Manhattan, NY',
        vibeKey: 'CHILL',
        startTime: new Date('2024-08-05T14:00:00'),
        endTime: new Date('2024-08-05T18:00:00'),
        category: 'photography',
      },
    ];

    let eventsCreated = 0;
    for (const eventData of historicalEvents) {
      try {
        // Create the historical event
        const event = await this.createHistoricalEventWithParticipation(
          eventData,
          emma.id,
        );
        eventsCreated++;
      } catch (error) {
        this.logger.error(
          `Failed to create historical event ${eventData.title}:`,
          error.message,
        );
      }
    }

    this.logger.log(
      `✅ Created ${eventsCreated} historical events with Emma's participation`,
    );
  }

  private async createHistoricalEventWithParticipation(
    eventData: any,
    userId: string,
  ) {
    // Create realistic AI analysis data
    const aiVibeAnalysis = this.generateRealisticAIData(eventData);

    // Generate embedding for event matching
    const embeddingText = `${eventData.title} – ${eventData.vibeKey}\n${aiVibeAnalysis.overallEventVibe}\n${eventData.venue}`;
    const embedding = this.generateMockEmbedding(embeddingText);
    const embeddingBuffer = Buffer.from(Float32Array.from(embedding).buffer);

    // Create the event
    const event = await this.prisma.event.create({
      data: {
        source: 'historical',
        sourceId: `historical_${Date.now()}_${Math.random()}`,
        title: eventData.title,
        description: eventData.description,
        imageUrl: eventData.imageUrl,
        gallery: eventData.gallery,
        venue: eventData.venue,
        address: eventData.address,
        lat: 40.7589 + (Math.random() - 0.5) * 0.1, // NYC area
        lng: -73.9851 + (Math.random() - 0.5) * 0.1,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        vibeKey: eventData.vibeKey as any,
        vibeAnalysis: aiVibeAnalysis.overallEventVibe,
        embedding: embeddingBuffer,
        aiRaw: {
          vibeKey: eventData.vibeKey,
          vibeAnalysis: aiVibeAnalysis.overallEventVibe,
          planAnalyses: {
            plan1: aiVibeAnalysis.plan1Analysis,
            plan2: aiVibeAnalysis.plan2Analysis,
          },
          discoveryContent: aiVibeAnalysis.discoveryContent,
          photoOptimization: aiVibeAnalysis.photoOptimization,
        } as any,
      },
    });

    // Create realistic plans for the historical event
    const plans = this.generateRealisticPlans(eventData);
    for (const planData of plans) {
      await this.prisma.plan.create({
        data: {
          eventId: event.id,
          title: planData.title,
          description: planData.description,
          emoji: planData.emoji,
        },
      });
    }

    // Add user as a member who attended
    await this.prisma.member.create({
      data: {
        userId: userId,
        eventId: event.id,
        status: 'JOINED',
      },
    });

    // Add some other users as members too (realistic social event)
    const otherUsers = await this.prisma.user.findMany({
      where: { id: { not: userId } },
      take: Math.floor(Math.random() * 3) + 2, // 2-4 other participants
    });

    for (const user of otherUsers) {
      await this.prisma.member.create({
        data: {
          userId: user.id,
          eventId: event.id,
          status: 'JOINED',
        },
      });
    }

    // Add interests
    await this.addEventInterests(event.id, eventData.category);

    return event;
  }

  private async seedHistoricalEventsForUser(userId: string) {
    this.logger.log(`📅 Creating 57 historical events for user ${userId}...`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      this.logger.warn(`User ${userId} not found, skipping historical events`);
      return;
    }

    // Generate 57 diverse historical events spanning different categories and vibes
    const eventTemplates = [
      // Art & Culture Events (15 events)
      {
        category: 'art',
        vibe: 'ARTSY',
        type: 'Museum Exhibition',
        venues: [
          'MoMA',
          'Guggenheim',
          'Whitney',
          'Brooklyn Museum',
          'Met Museum',
        ],
      },
      {
        category: 'art',
        vibe: 'CULTURAL',
        type: 'Gallery Opening',
        venues: [
          'Chelsea Gallery',
          'Soho Gallery',
          'Lower East Side Art Space',
          'Brooklyn Gallery',
        ],
      },
      {
        category: 'theater',
        vibe: 'CULTURAL',
        type: 'Broadway Show',
        venues: [
          'Majestic Theatre',
          'Imperial Theatre',
          'Ambassador Theatre',
          'Nederlander Theatre',
        ],
      },

      // Music Events (18 events)
      {
        category: 'concert',
        vibe: 'PARTY',
        type: 'Concert',
        venues: [
          'Madison Square Garden',
          'Barclays Center',
          'Terminal 5',
          'Irving Plaza',
          'Music Hall',
        ],
      },
      {
        category: 'music',
        vibe: 'CHILL',
        type: 'Jazz Night',
        venues: [
          'Blue Note',
          'Village Vanguard',
          'Jazz Standard',
          'Smalls Jazz Club',
        ],
      },
      {
        category: 'music',
        vibe: 'DATE_NIGHT',
        type: 'Acoustic Show',
        venues: [
          'Café Wha?',
          'The Bitter End',
          'Mercury Lounge',
          'Bowery Ballroom',
        ],
      },

      // Food & Social Events (12 events)
      {
        category: 'food',
        vibe: 'SOCIAL',
        type: 'Food Festival',
        venues: [
          'Union Square',
          'Bryant Park',
          'Madison Square Park',
          'Washington Square Park',
        ],
      },
      {
        category: 'food',
        vibe: 'CHILL',
        type: 'Wine Tasting',
        venues: ['Wine Bar', 'Rooftop Lounge', 'Speakeasy', 'Wine Cellar'],
      },

      // Photography & Creative (8 events)
      {
        category: 'photography',
        vibe: 'CHILL',
        type: 'Photo Workshop',
        venues: [
          'Photography Studio',
          'Creative Space',
          'Art Center',
          'Workshop Space',
        ],
      },

      // Nightlife & Entertainment (4 events)
      {
        category: 'comedy',
        vibe: 'CHILL',
        type: 'Comedy Show',
        venues: [
          'Comedy Cellar',
          'Stand Up NY',
          'Gotham Comedy Club',
          "Caroline's",
        ],
      },
    ];

    let eventsCreated = 0;
    const totalEvents = 57; // Create all 57 events

    for (let i = 0; i < totalEvents; i++) {
      try {
        const template = eventTemplates[i % eventTemplates.length];
        const venue = template.venues[i % template.venues.length];

        // Generate random date between 6 months and 2 years ago
        const monthsAgo = Math.floor(Math.random() * 18) + 6; // 6-24 months ago
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - monthsAgo);
        startDate.setDate(Math.floor(Math.random() * 28) + 1);
        startDate.setHours(Math.floor(Math.random() * 6) + 18); // 6PM-12AM

        const endDate = new Date(startDate);
        endDate.setHours(
          startDate.getHours() + Math.floor(Math.random() * 4) + 2,
        ); // 2-6 hours later

        const eventData = {
          title: this.generateEventTitle(template.type, venue, i),
          description: this.generateEventDescription(template.type, venue),
          imageUrl: this.getImageForCategory(template.category, i),
          gallery: this.generateGalleryForCategory(template.category, i),
          venue: venue,
          address: this.generateNYCAddress(venue),
          vibeKey: template.vibe,
          startTime: startDate,
          endTime: endDate,
          category: template.category,
        };

        await this.createHistoricalEventWithParticipation(eventData, user.id);
        eventsCreated++;

        // Add some variety in participation status (mostly JOINED, some with reviews)
        if (i % 7 === 0) {
          // Every 7th event, user couldn't make it
          await this.updateMemberStatus(
            eventData.title,
            user.id,
            'CANT_MAKE_IT',
          );
        } else if (i % 5 === 0) {
          // Every 5th event, add a review
          await this.addEventReview(eventData.title, user.id);
        }
      } catch (error) {
        this.logger.error(
          `Failed to create historical event ${i}:`,
          error.message,
        );
      }
    }

    this.logger.log(
      `✅ Created ${eventsCreated} historical events with user participation`,
    );
  }

  private generateEventTitle(
    type: string,
    venue: string,
    index: number,
  ): string {
    const titles = {
      'Museum Exhibition': [
        'Contemporary Photography Showcase',
        'Modern Art Retrospective',
        'Abstract Expressions',
        'Street Art Revolution',
        'Digital Art Innovations',
        'Sculpture Garden Preview',
        'Photography Masters',
        'Pop Art Explosion',
        'Minimalist Movements',
        'Cultural Heritage Display',
        'Artist Spotlight Series',
        'Creative Visions',
        'Urban Art Showcase',
        'Fine Arts Collective',
        'Visual Storytelling',
      ],
      'Gallery Opening': [
        'Emerging Artists Debut',
        'Local Photographers United',
        'Mixed Media Showcase',
        'Portrait Series Launch',
        'Abstract Landscapes',
        'City Life Through Lens',
        'Creative Expressions',
        'Artistic Interpretations',
      ],
      'Broadway Show': [
        'Hamilton',
        'The Lion King',
        'Wicked',
        'Chicago',
        'The Book of Mormon',
        'Frozen',
        'Aladdin',
        'The Phantom of the Opera',
        'Dear Evan Hansen',
        'Come From Away',
        'Six',
        'Hadestown',
      ],
      Concert: [
        'Indie Rock Night',
        'Electronic Music Festival',
        'Alternative Showcase',
        'Rock Legends Tour',
        'Music Festival Preview',
        'Singer-Songwriter Evening',
        'Band Battle Royale',
        'Summer Concert Series',
      ],
      'Jazz Night': [
        'Sunday Jazz Brunch',
        'Late Night Jazz Session',
        'Jazz Quartet Performance',
        'Smooth Jazz Evening',
        'Jazz Fusion Night',
        'Classic Jazz Standards',
        'Modern Jazz Interpretations',
        'Jazz Jam Session',
      ],
      'Acoustic Show': [
        'Intimate Acoustic Set',
        'Songwriter Circle',
        'Unplugged Session',
        'Coffee House Concert',
        'Acoustic Guitar Showcase',
        'Folk Music Night',
        'Singer-Songwriter Spotlight',
        'Acoustic Covers',
      ],
      'Food Festival': [
        'NYC Food Truck Rally',
        'International Cuisine Fair',
        'Street Food Festival',
        'Farm to Table Expo',
        'Artisan Food Market',
        'Gourmet Food Showcase',
        'Cultural Food Celebration',
        'Local Eats Festival',
      ],
      'Wine Tasting': [
        'Italian Wine Showcase',
        'Natural Wine Tasting',
        'Wine & Cheese Pairing',
        'Sommelier Selection',
        'Boutique Winery Tour',
        'Organic Wine Experience',
        'Wine Education Class',
        'Vintage Collection',
      ],
      'Photo Workshop': [
        'Street Photography Masterclass',
        'Portrait Lighting Workshop',
        'Digital Photography Basics',
        'Creative Composition Class',
        'Food Photography Tips',
        'Urban Photography Walk',
        'Night Photography Techniques',
      ],
      'Comedy Show': [
        'Stand-Up Comedy Night',
        'Improv Comedy Show',
        'Comedy Open Mic',
        'Sketch Comedy Performance',
        'Comedy Roast Event',
        'Comedian Spotlight',
        'Interactive Comedy Show',
        'Comedy Club Special',
      ],
    };

    const typeTitle = titles[type];
    if (!typeTitle || typeTitle.length === 0) {
      return `${type} Event`;
    }
    return typeTitle[index % typeTitle.length];
  }

  private generateEventDescription(type: string, venue: string): string {
    const descriptions = {
      'Museum Exhibition': `Exclusive exhibition at ${venue} featuring cutting-edge contemporary works from emerging and established artists.`,
      'Gallery Opening': `Opening night celebration at ${venue} showcasing innovative new works from local NYC artists.`,
      'Broadway Show': `Award-winning Broadway production at ${venue} bringing world-class entertainment to the heart of NYC.`,
      Concert: `High-energy live music performance at ${venue} featuring incredible sound and an unforgettable atmosphere.`,
      'Jazz Night': `Intimate jazz performance at ${venue} with talented musicians creating the perfect evening soundtrack.`,
      'Acoustic Show': `Cozy acoustic performance at ${venue} featuring singer-songwriters in an intimate setting.`,
      'Food Festival': `Celebration of NYC's diverse culinary scene at ${venue} with food trucks, vendors, and tastings.`,
      'Wine Tasting': `Curated wine experience at ${venue} featuring selections from renowned vineyards and expert guidance.`,
      'Photo Workshop': `Hands-on photography workshop at ${venue} led by professional photographers sharing industry insights.`,
      'Comedy Show': `Hilarious comedy performance at ${venue} featuring both rising stars and established comedians.`,
    };

    return (
      descriptions[type] ||
      `Exciting ${type.toLowerCase()} event at ${venue} with great atmosphere and unforgettable experiences.`
    );
  }

  private getImageForCategory(category: string, index: number): string {
    const images = {
      art: [
        'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1571115764595-644a1f56a55c?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1544967082-d9759068e3b0?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=800&h=600&fit=crop',
      ],
      theater: [
        'https://images.unsplash.com/photo-1507924538820-ede94a04019d?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1503095396549-807759245b35?w=800&h=600&fit=crop',
      ],
      concert: [
        'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&h=600&fit=crop',
      ],
      music: [
        'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1556909258-f87e1c77b1d4?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=600&fit=crop',
      ],
      food: [
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1556909114-28e2e5d58e20?w=800&h=600&fit=crop',
      ],
      photography: [
        'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&h=600&fit=crop',
      ],
      comedy: [
        'https://images.unsplash.com/photo-1527224531-69d3ad20fe65?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&h=600&fit=crop',
      ],
    };

    const categoryImages = images[category] || images.art;
    if (!categoryImages || categoryImages.length === 0) {
      return 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&h=600&fit=crop';
    }
    return categoryImages[index % categoryImages.length];
  }

  private generateGalleryForCategory(
    category: string,
    index: number,
  ): string[] {
    const baseImage = this.getImageForCategory(category, index);
    // Generate 2-4 gallery images by adding different crop parameters
    return [
      baseImage,
      baseImage.replace('fit=crop', 'fit=crop&crop=top'),
      baseImage.replace('fit=crop', 'fit=crop&crop=bottom'),
    ];
  }

  private generateNYCAddress(venue: string): string {
    const addresses = [
      '123 Broadway, New York, NY',
      '456 Fifth Ave, New York, NY',
      '789 Madison Ave, New York, NY',
      '321 Park Ave, New York, NY',
      '654 Lexington Ave, New York, NY',
      '987 Amsterdam Ave, New York, NY',
      '147 Bleecker St, New York, NY',
      '258 Spring St, New York, NY',
      '369 Canal St, New York, NY',
      '159 Houston St, New York, NY',
      '267 Delancey St, New York, NY',
      '348 Rivington St, New York, NY',
      '426 Atlantic Ave, Brooklyn, NY',
      '537 Flatbush Ave, Brooklyn, NY',
      '648 Court St, Brooklyn, NY',
      '759 Smith St, Brooklyn, NY',
      '816 7th Ave, Brooklyn, NY',
      '923 8th Ave, Brooklyn, NY',
    ];

    return addresses[venue.length % addresses.length];
  }

  private async updateMemberStatus(
    eventTitle: string,
    userId: string,
    status: string,
  ) {
    try {
      const event = await this.prisma.event.findFirst({
        where: { title: eventTitle },
      });

      if (event) {
        await this.prisma.member.updateMany({
          where: {
            userId: userId,
            eventId: event.id,
          },
          data: { status: status as any },
        });
      }
    } catch (error) {
      // Ignore errors for member status updates
    }
  }

  private async addEventReview(eventTitle: string, userId: string) {
    try {
      const event = await this.prisma.event.findFirst({
        where: { title: eventTitle },
      });

      if (event) {
        const reviews = [
          'Amazing experience! The atmosphere was perfect and I had such a great time.',
          'Loved every minute of it. Great venue, great people, definitely recommend!',
          'Such a fun evening! Met some wonderful people and enjoyed every moment.',
          'Perfect night out. The quality was top-notch and the vibe was just right.',
          'Incredible event! So glad I attended, it exceeded all my expectations.',
          'Great time with friends! The venue was beautiful and everything was well organized.',
          'Fantastic experience! Would definitely attend again and recommend to others.',
        ];

        await this.prisma.eventReview.create({
          data: {
            userId: userId,
            eventId: event.id,
            placeRating: Math.floor(Math.random() * 2) + 4, // 4-5 stars
            planRating: Math.floor(Math.random() * 2) + 4, // 4-5 stars
            comment: reviews[Math.floor(Math.random() * reviews.length)],
          },
        });
      }
    } catch (error) {
      // Ignore errors for review creation
    }
  }

  private async seedEvents() {
    this.logger.log('🎭 Seeding realistic events...');

    const mockTicketmasterEvents = [
      {
        name: 'Taylor Swift | The Eras Tour',
        info: "Experience the musical journey of a generation with Taylor Swift's record-breaking Eras Tour at Madison Square Garden.",
        venue: 'Madison Square Garden',
        address: '4 Pennsylvania Plaza, New York, NY',
        startTime: new Date('2024-09-15T19:30:00'),
        endTime: new Date('2024-09-15T23:00:00'),
        lat: 40.7505,
        lng: -73.9934,
        images: [
          {
            url: 'https://s1.ticketm.net/dam/a/b85/1b62e05c-da5b-4d39-8b85-d5e5e0e4cb85_RETINA_PORTRAIT_16_9.jpg',
            width: 640,
            height: 360,
          },
          {
            url: 'https://s1.ticketm.net/dam/a/b85/1b62e05c-da5b-4d39-8b85-d5e5e0e4cb85_TABLET_LANDSCAPE_LARGE_16_9.jpg',
            width: 2048,
            height: 1152,
          },
          {
            url: 'https://s1.ticketm.net/dam/a/b85/1b62e05c-da5b-4d39-8b85-d5e5e0e4cb85_RECOMENDATION_16_9.jpg',
            width: 1024,
            height: 576,
          },
        ],
        priceRanges: [{ min: 89, max: 450 }],
        classifications: [
          { segment: { name: 'Music' }, genre: { name: 'Pop' } },
        ],
        vibeKey: 'PARTY',
        category: 'concert',
      },
      {
        name: 'The Lion King - Broadway',
        info: "Disney's award-winning musical brings the African savanna to life in this unforgettable Broadway experience.",
        venue: 'Minskoff Theatre',
        address: '1515 Broadway, New York, NY',
        startTime: new Date('2024-09-20T20:00:00'),
        endTime: new Date('2024-09-20T22:45:00'),
        lat: 40.759,
        lng: -73.9845,
        images: [
          {
            url: 'https://s1.ticketm.net/dam/a/3a1/0fcb8e9b-20c4-4c18-b3a1-8a7e7c8e33a1_TABLET_LANDSCAPE_LARGE_16_9.jpg',
            width: 2048,
            height: 1152,
          },
          {
            url: 'https://s1.ticketm.net/dam/a/3a1/0fcb8e9b-20c4-4c18-b3a1-8a7e7c8e33a1_RETINA_PORTRAIT_16_9.jpg',
            width: 640,
            height: 360,
          },
          {
            url: 'https://s1.ticketm.net/dam/a/3a1/0fcb8e9b-20c4-4c18-b3a1-8a7e7c8e33a1_RECOMENDATION_16_9.jpg',
            width: 1024,
            height: 576,
          },
        ],
        priceRanges: [{ min: 79, max: 199 }],
        classifications: [
          { segment: { name: 'Arts & Theatre' }, genre: { name: 'Musical' } },
        ],
        vibeKey: 'CULTURAL',
        category: 'theater',
      },
      {
        name: 'New York Knicks vs. Boston Celtics',
        info: 'Classic NBA rivalry as the Knicks take on the Celtics in an epic showdown at Madison Square Garden.',
        venue: 'Madison Square Garden',
        address: '4 Pennsylvania Plaza, New York, NY',
        startTime: new Date('2024-09-25T19:30:00'),
        endTime: new Date('2024-09-25T22:00:00'),
        lat: 40.7505,
        lng: -73.9934,
        images: [
          {
            url: 'https://s1.ticketm.net/dam/a/c7d/8a2b9c5d-4e6f-7890-bc7d-ef1234567890_TABLET_LANDSCAPE_LARGE_16_9.jpg',
            width: 2048,
            height: 1152,
          },
          {
            url: 'https://s1.ticketm.net/dam/a/c7d/8a2b9c5d-4e6f-7890-bc7d-ef1234567890_RETINA_PORTRAIT_16_9.jpg',
            width: 640,
            height: 360,
          },
          {
            url: 'https://s1.ticketm.net/dam/a/c7d/8a2b9c5d-4e6f-7890-bc7d-ef1234567890_RECOMENDATION_16_9.jpg',
            width: 1024,
            height: 576,
          },
        ],
        priceRanges: [{ min: 45, max: 350 }],
        classifications: [
          { segment: { name: 'Sports' }, genre: { name: 'Basketball' } },
        ],
        vibeKey: 'SOCIAL',
        category: 'sports',
      },
      {
        name: 'Metropolitan Opera: La Bohème',
        info: "Puccini's timeless masterpiece about love and loss in 1890s Paris, featuring world-class performers.",
        venue: 'Metropolitan Opera House',
        address: '30 Lincoln Center Plaza, New York, NY',
        startTime: new Date('2024-09-28T19:30:00'),
        endTime: new Date('2024-09-28T22:30:00'),
        lat: 40.7729,
        lng: -73.9844,
        images: [
          {
            url: 'https://s1.ticketm.net/dam/a/f8e/2d3c4b5a-6789-0123-af8e-456789012345_TABLET_LANDSCAPE_LARGE_16_9.jpg',
            width: 2048,
            height: 1152,
          },
          {
            url: 'https://s1.ticketm.net/dam/a/f8e/2d3c4b5a-6789-0123-af8e-456789012345_RETINA_PORTRAIT_16_9.jpg',
            width: 640,
            height: 360,
          },
          {
            url: 'https://s1.ticketm.net/dam/a/f8e/2d3c4b5a-6789-0123-af8e-456789012345_RECOMENDATION_16_9.jpg',
            width: 1024,
            height: 576,
          },
        ],
        priceRanges: [{ min: 25, max: 450 }],
        classifications: [
          { segment: { name: 'Arts & Theatre' }, genre: { name: 'Opera' } },
        ],
        vibeKey: 'CULTURAL',
        category: 'opera',
      },
      {
        name: 'Comedy Cellar: Stand-Up Showcase',
        info: "An intimate evening of comedy featuring rising stars and surprise guest appearances at NYC's legendary comedy club.",
        venue: 'Comedy Cellar',
        address: '117 MacDougal St, New York, NY',
        startTime: new Date('2024-09-30T21:00:00'),
        endTime: new Date('2024-09-30T23:00:00'),
        lat: 40.73,
        lng: -74.0033,
        images: [
          {
            url: 'https://s1.ticketm.net/dam/a/9b2/5e7f8c3a-1234-5678-9b2a-cdef01234567_TABLET_LANDSCAPE_LARGE_16_9.jpg',
            width: 2048,
            height: 1152,
          },
          {
            url: 'https://s1.ticketm.net/dam/a/9b2/5e7f8c3a-1234-5678-9b2a-cdef01234567_RETINA_PORTRAIT_16_9.jpg',
            width: 640,
            height: 360,
          },
        ],
        priceRanges: [{ min: 20, max: 35 }],
        classifications: [
          { segment: { name: 'Arts & Theatre' }, genre: { name: 'Comedy' } },
        ],
        vibeKey: 'CHILL',
        category: 'comedy',
      },
      {
        name: 'Brooklyn Museum: Basquiat Exhibition Opening',
        info: 'Exclusive opening night for the groundbreaking Jean-Michel Basquiat retrospective with curator talks and cocktails.',
        venue: 'Brooklyn Museum',
        address: '200 Eastern Pkwy, Brooklyn, NY',
        startTime: new Date('2024-10-02T18:00:00'),
        endTime: new Date('2024-10-02T21:00:00'),
        lat: 40.6712,
        lng: -73.9636,
        images: [
          {
            url: 'https://s1.ticketm.net/dam/a/7c4/9f2e8d1a-5678-9012-a7c4-345678901234_TABLET_LANDSCAPE_LARGE_16_9.jpg',
            width: 2048,
            height: 1152,
          },
          {
            url: 'https://s1.ticketm.net/dam/a/7c4/9f2e8d1a-5678-9012-a7c4-345678901234_RETINA_PORTRAIT_16_9.jpg',
            width: 640,
            height: 360,
          },
          {
            url: 'https://s1.ticketm.net/dam/a/7c4/9f2e8d1a-5678-9012-a7c4-345678901234_RECOMENDATION_16_9.jpg',
            width: 1024,
            height: 576,
          },
        ],
        priceRanges: [{ min: 35, max: 75 }],
        classifications: [
          {
            segment: { name: 'Arts & Theatre' },
            genre: { name: 'Visual Arts' },
          },
        ],
        vibeKey: 'ARTSY',
        category: 'art',
      },
    ];

    for (const eventData of mockTicketmasterEvents) {
      await this.createEventWithAIData(eventData);
    }

    this.logger.log(
      `✅ Created ${mockTicketmasterEvents.length} events with AI data`,
    );
  }

  private async createEventWithAIData(eventData: any) {
    try {
      // Create basic event
      const event = await this.prisma.event.create({
        data: {
          source: 'ticketmaster',
          sourceId: `mock_${Date.now()}_${Math.random()}`,
          title: eventData.name,
          description: eventData.info,
          imageUrl: eventData.images[0]?.url || null,
          venue: eventData.venue,
          address: eventData.address,
          lat: eventData.lat,
          lng: eventData.lng,
          startTime: eventData.startTime,
          endTime: eventData.endTime,
          vibeKey: eventData.vibeKey as any,
          gallery: eventData.images.map((img: any) => img.url).filter(Boolean),
        },
      });

      // Create realistic AI analysis data
      const aiVibeAnalysis = this.generateRealisticAIData(eventData);

      // Generate realistic mock embedding for event matching (API quota fallback)
      const embeddingText = `${eventData.name} – ${eventData.vibeKey}\n${aiVibeAnalysis.overallEventVibe}\n${eventData.venue}`;
      const embedding = this.generateMockEmbedding(embeddingText);
      const embeddingBuffer = Buffer.from(Float32Array.from(embedding).buffer);

      // Create enhanced plans
      const plans = this.generateRealisticPlans(eventData);

      // Update event with AI data and embedding
      await this.prisma.event.update({
        where: { id: event.id },
        data: {
          vibeAnalysis: aiVibeAnalysis.overallEventVibe,
          embedding: embeddingBuffer,
          aiRaw: {
            vibeKey: eventData.vibeKey,
            vibeAnalysis: aiVibeAnalysis.overallEventVibe,
            planAnalyses: {
              plan1: aiVibeAnalysis.plan1Analysis,
              plan2: aiVibeAnalysis.plan2Analysis,
            },
            discoveryContent: aiVibeAnalysis.discoveryContent,
            photoOptimization: aiVibeAnalysis.photoOptimization,
          } as any,
        },
      });

      // Create plans
      for (const planData of plans) {
        await this.prisma.plan.create({
          data: {
            eventId: event.id,
            title: planData.title,
            description: planData.description,
            emoji: planData.emoji,
          },
        });
      }

      // Add interests
      await this.addEventInterests(event.id, eventData.category);

      this.logger.log(`✅ Created event: ${eventData.name}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to create event ${eventData.name}:`,
        error.message,
      );
    }
  }

  private generateRealisticAIData(eventData: any) {
    const vibeDescriptions = {
      PARTY:
        'An electrifying atmosphere where music, energy, and celebration create unforgettable moments',
      CULTURAL:
        'A sophisticated cultural experience that enriches the soul and stimulates intellectual curiosity',
      SOCIAL:
        'A dynamic social gathering perfect for connecting with others who share your passions',
      ARTSY:
        'An inspiring artistic journey that celebrates creativity and cultural expression',
      CHILL:
        'A relaxed and intimate setting where laughter and good vibes flow naturally',
    };

    return {
      overallEventVibe:
        vibeDescriptions[eventData.vibeKey] ||
        'An engaging experience that brings people together',
      plan1Analysis: {
        vibeKey: eventData.vibeKey,
        description:
          'Experience the main event with premium seating and exclusive access',
        whyThisVibe:
          'The energy and atmosphere create the perfect setting for this vibe',
        expectedExperience:
          "You'll feel completely immersed in the excitement and culture",
      },
      plan2Analysis: {
        vibeKey: eventData.vibeKey,
        description:
          'Enjoy a more intimate experience with behind-the-scenes access',
        whyThisVibe: 'The exclusive nature enhances the overall experience',
        expectedExperience: 'A deeper connection to the performance and venue',
      },
      discoveryContent: {
        tagline: this.generateTagline(eventData),
        hookDescription: this.generateHookDescription(eventData),
        quickStats: {
          duration: this.calculateDuration(
            eventData.startTime,
            eventData.endTime,
          ),
          vibe: eventData.vibeKey.toLowerCase().replace('_', ' '),
          priceRange: this.getPriceRange(eventData.priceRanges),
          groupSize: '4-8 people',
        },
        whyThisEvent: this.generateWhyThisEvent(eventData),
        socialProof: 'Perfect for culture enthusiasts and experience seekers',
      },
      photoOptimization: {
        primaryPhoto: eventData.images[0]?.url || '',
        galleryPhotos: eventData.images
          .slice(1)
          .map((img: any) => img.url)
          .filter(Boolean),
        photoDescriptions: [
          'Main venue exterior',
          'Performance atmosphere',
          'Audience experience',
        ],
        visualVibe: 'sophisticated',
      },
    };
  }

  private generateRealisticPlans(eventData: any) {
    const planTemplates = {
      concert: [
        {
          title: 'VIP Experience & Premium Seating',
          description:
            'Skip the lines with VIP entry, premium seating, and exclusive merchandise access. Arrive early to soak in the pre-show atmosphere and connect with fellow fans.',
          emoji: '🎤',
        },
        {
          title: 'General Admission & After-Party',
          description:
            'Join the energetic crowd in general admission, dance to every song, and continue the night at a nearby venue for drinks and music discussion.',
          emoji: '🎵',
        },
      ],
      theater: [
        {
          title: 'Premium Orchestra & Pre-Show Dinner',
          description:
            'Enjoy a sophisticated pre-theater dinner at a nearby restaurant, followed by premium orchestra seats for the best views and acoustics.',
          emoji: '🎭',
        },
        {
          title: 'Mezzanine Seating & Broadway District Exploration',
          description:
            'Experience the show from mezzanine seats with excellent sightlines, then explore the vibrant Broadway district with its iconic theaters and late-night eateries.',
          emoji: '🌟',
        },
      ],
      sports: [
        {
          title: 'Courtside Experience & Pre-Game Festivities',
          description:
            'Feel the intensity up close with premium seating, pre-game warm-up access, and exclusive concessions. Perfect for the ultimate fan experience.',
          emoji: '🏀',
        },
        {
          title: 'Upper Level & Sports Bar Celebration',
          description:
            'Enjoy the game from upper level seats with great atmosphere, then celebrate (or commiserate) at a legendary NYC sports bar with fellow fans.',
          emoji: '🍻',
        },
      ],
      opera: [
        {
          title: 'Grand Tier & Champagne Intermission',
          description:
            "Experience opera's grandeur from the Grand Tier with champagne service during intermission. A truly elegant cultural evening.",
          emoji: '🥂',
        },
        {
          title: 'Orchestra Seating & Lincoln Center Stroll',
          description:
            "Premium orchestra seats for optimal acoustics, followed by a romantic evening stroll through Lincoln Center's illuminated plaza.",
          emoji: '🎼',
        },
      ],
      comedy: [
        {
          title: 'Front Row Comedy & Greenwich Village Tour',
          description:
            "Get up close with comedians in front row seats, then explore Greenwich Village's bohemian charm and historic comedy venues.",
          emoji: '😂',
        },
        {
          title: 'Table Seating & Late-Night Food Adventure',
          description:
            "Enjoy drinks and laughs at a shared table, then discover NYC's best late-night eats in the surrounding neighborhood.",
          emoji: '🍕',
        },
      ],
      art: [
        {
          title: 'Private Curator Tour & Opening Reception',
          description:
            'Join an exclusive curator-led tour followed by the opening reception with wine, appetizers, and conversations with fellow art enthusiasts.',
          emoji: '🎨',
        },
        {
          title: 'Self-Guided Exploration & Museum Café',
          description:
            'Take your time exploring the exhibition at your own pace, then reflect on the art over coffee and pastries in the museum café.',
          emoji: '☕',
        },
      ],
    };

    return planTemplates[eventData.category] || planTemplates.concert;
  }

  private generateTagline(eventData: any): string {
    const taglines = {
      PARTY: 'Epic Night Out Awaits',
      CULTURAL: 'Sophisticated Cultural Journey',
      SOCIAL: 'Connect & Celebrate Together',
      ARTSY: 'Immerse in Creative Excellence',
      CHILL: 'Relaxed Vibes & Good Times',
    };
    return taglines[eventData.vibeKey] || 'Unforgettable Experience';
  }

  private generateHookDescription(eventData: any): string {
    return `Don't miss this incredible ${eventData.category} experience that perfectly captures NYC's vibrant culture. Limited spots available for this must-attend event!`;
  }

  private calculateDuration(startTime: Date, endTime: Date): string {
    const diff = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`.trim();
  }

  private getPriceRange(priceRanges: any[]): string {
    if (!priceRanges || priceRanges.length === 0) return '$$';
    const max = priceRanges[0].max;
    if (max < 50) return '$';
    if (max < 150) return '$$';
    if (max < 300) return '$$$';
    return '$$$$';
  }

  private generateWhyThisEvent(eventData: any): string[] {
    const reasons = {
      concert: [
        'World-class musical performance',
        'Iconic NYC venue',
        'Unforgettable live experience',
      ],
      theater: [
        'Broadway excellence',
        'Cultural enrichment',
        'NYC theater tradition',
      ],
      sports: [
        'Classic team rivalry',
        'Electric atmosphere',
        'Legendary venue',
      ],
      opera: [
        'World-renowned performers',
        'Artistic masterpiece',
        'Lincoln Center prestige',
      ],
      comedy: [
        'NYC comedy legends',
        'Intimate venue',
        'Surprise guest appearances',
      ],
      art: [
        'Exclusive exhibition',
        'Cultural significance',
        'Inspiring artwork',
      ],
    };
    return reasons[eventData.category] || reasons.concert;
  }

  private async addEventInterests(eventId: string, category: string) {
    const categoryInterestMap = {
      concert: ['live-music', 'photography'],
      theater: ['theater', 'art-galleries'],
      sports: ['games', 'comedy-shows'],
      opera: ['theater', 'museums'],
      comedy: ['comedy-shows', 'karaoke'],
      art: ['art-galleries', 'museums', 'photography'],
    };

    const interestSlugs = categoryInterestMap[category] || ['live-music'];
    const interests = await this.prisma.interest.findMany({
      where: { slug: { in: interestSlugs } },
    });

    for (const interest of interests) {
      await this.prisma.eventInterest.create({
        data: {
          eventId,
          interestId: interest.id,
          weight: Math.floor(Math.random() * 3) + 3,
        },
      });
    }
  }

  /**
   * Generate realistic mock embedding based on text content
   * This creates deterministic embeddings for development/testing
   */
  private generateMockEmbedding(text: string): number[] {
    // Create a deterministic hash-based embedding
    const normalized = text.toLowerCase().trim();
    const embedding = new Array(768).fill(0); // Standard embedding size

    // Use text content to generate realistic values
    for (let i = 0; i < normalized.length && i < 100; i++) {
      const charCode = normalized.charCodeAt(i);
      const index = charCode % embedding.length;
      embedding[index] += Math.sin(charCode * (i + 1)) * 0.1;
    }

    // Add vibe-based patterns
    const vibePatterns = {
      PARTY: [0.8, -0.3, 0.6, 0.9, -0.2],
      ARTSY: [-0.4, 0.7, -0.1, 0.5, 0.8],
      CULTURAL: [0.3, 0.6, -0.5, 0.7, 0.4],
      CHILL: [-0.6, 0.2, 0.8, -0.3, 0.5],
      SOCIAL: [0.7, 0.4, -0.2, 0.8, -0.1],
    };

    Object.entries(vibePatterns).forEach(([vibe, pattern], vibeIndex) => {
      if (normalized.includes(vibe.toLowerCase())) {
        pattern.forEach((val, i) => {
          if (vibeIndex * 50 + i < embedding.length) {
            embedding[vibeIndex * 50 + i] += val;
          }
        });
      }
    });

    // Interest-based patterns
    const interests = [
      'music',
      'art',
      'food',
      'theater',
      'gaming',
      'photography',
    ];
    interests.forEach((interest, idx) => {
      if (normalized.includes(interest)) {
        for (
          let i = idx * 100;
          i < (idx + 1) * 100 && i < embedding.length;
          i++
        ) {
          embedding[i] += Math.cos(idx + 1) * 0.3;
        }
      }
    });

    // Normalize to realistic range [-1, 1]
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0),
    );
    return embedding.map((val) =>
      magnitude > 0 ? val / magnitude : Math.random() * 0.1 - 0.05,
    );
  }
}
