import { config } from 'dotenv';
// Load environment variables explicitly
config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IngestionService } from '../modules/ingestion/ingestion.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import { AIService } from '../modules/ai/ai.service';
import { RegionIngestionService } from '../modules/ingestion/services/region-ingestion.service';
import { TicketmasterDiscoveryService } from '../modules/external-apis/services/ticketmaster-discovery.service';
import { SeedService } from '../seed/seed.service';

async function main() {
  const [, , cmd, ...argv] = process.argv;
  if (!cmd) {
    console.error('Usage: ts-node src/cli/runner.ts <command> [args]');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    switch (cmd) {
      case 'ingest:nyc': {
        const ingestion = app.get(IngestionService);
        let max: number | undefined;
        for (let i = 0; i < argv.length; i++) {
          const a = argv[i];
          if (a?.startsWith('--max=')) {
            const val = Number(a.split('=')[1]);
            if (!Number.isNaN(val)) max = val;
          } else if (a === '--max') {
            const next = Number(argv[i + 1]);
            if (!Number.isNaN(next)) max = next;
          } else if (/^\d+$/.test(a)) {
            const val = Number(a);
            if (!Number.isNaN(val)) max = val;
          }
        }
        await ingestion.pullTicketmasterNYC(max);
        console.log('Ingestion complete');
        break;
      }
      case 'events:ai:build-plans': {
        const eventId = argv[0];
        if (!eventId) throw new Error('Usage: events:ai:build-plans <eventId>');
        const prisma = app.get(PrismaService);
        const ai = app.get(AIService);
        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) throw new Error('Event not found');
        const count = await prisma.plan.count({ where: { eventId: event.id } });
        if (count >= 2) {
          console.log('Already has 2 plans');
          break;
        }
        const built = await ai.buildTwoPlans({
          title: event.title,
          venue: event.venue ?? undefined,
          address: event.address ?? undefined,
          start: event.startTime?.toISOString(),
        });
        for (const p of built) {
          await prisma.plan.create({
            data: {
              eventId: event.id,
              title: p.title,
              description: p.description,
              emoji: p.emoji ?? null,
            },
          });
        }
        console.log('Plans created');
        break;
      }
      case 'events:clear': {
        const prisma = app.get(PrismaService);
        console.log('🗑️ Clearing all events and related data...');

        await prisma.planVote.deleteMany();
        await prisma.plan.deleteMany();
        await prisma.eventMessage.deleteMany();
        await prisma.eventReview.deleteMany();
        await prisma.eventReviewPeer.deleteMany();
        await prisma.eventInterest.deleteMany();
        await prisma.member.deleteMany();
        await prisma.event.deleteMany();

        console.log('✅ All events cleared');
        break;
      }
      case 'ingest:regions': {
        const regionIngestion = app.get(RegionIngestionService);
        let maxEvents = 5;

        for (let i = 0; i < argv.length; i++) {
          const a = argv[i];
          if (a?.startsWith('--max=')) {
            const val = Number(a.split('=')[1]);
            if (!Number.isNaN(val)) maxEvents = val;
          } else if (a === '--max') {
            const next = Number(argv[i + 1]);
            if (!Number.isNaN(next)) maxEvents = next;
          } else if (/^\d+$/.test(a)) {
            const val = Number(a);
            if (!Number.isNaN(val)) maxEvents = val;
          }
        }

        console.log(`🌆 Creating ${maxEvents} region-based events...`);

        const regions = [
          { name: 'SoHo, New York', vibeKey: 'RELAXED' },
          { name: 'Williamsburg, Brooklyn', vibeKey: 'ARTSY' },
          { name: 'East Village, New York', vibeKey: 'PARTY' },
          { name: 'Chelsea, New York', vibeKey: 'DATE_NIGHT' },
          { name: 'Lower East Side, New York', vibeKey: 'SOCIAL' },
          { name: 'Greenwich Village, New York', vibeKey: 'CULTURAL' },
          { name: 'Tribeca, New York', vibeKey: 'CHILL' },
          { name: 'Upper West Side, New York', vibeKey: 'MORNING' },
        ];

        let created = 0;
        let failed = 0;

        for (let i = 0; i < Math.min(maxEvents, regions.length); i++) {
          const region = regions[i];
          try {
            console.log(`📍 Creating: ${region.name} - ${region.vibeKey}`);

            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(19 + i, 0, 0, 0);

            const endTime = new Date(tomorrow);
            endTime.setHours(endTime.getHours() + 3);

            const event = await regionIngestion.generateRegionEvent({
              region: { name: region.name },
              vibeKey: region.vibeKey as any,
              searchRadiusM: 800,
              startTime: tomorrow,
              endTime: endTime,
            });
            if (!event) return null;
            if (event.plans?.length > 0) {
              event.plans.forEach((plan: any, idx: number) => {
                console.log(
                  `      ${idx + 1}. ${plan.venue} (${plan.rating}⭐)`,
                );
              });
            }
            console.log('');
            created++;
          } catch (error) {
            console.error(`❌ Failed ${region.name}:`, error.message);
            failed++;
          }
        }

        console.log(`\n🎯 Summary: ${created} created, ${failed} failed`);
        break;
      }
      case 'external:test': {
        const regionIngestion = app.get(RegionIngestionService);
        const lat = parseFloat(argv[0]) || 40.7484; // NYC default
        const lng = parseFloat(argv[1]) || -73.9857;
        const maxEvents = parseInt(argv[2]) || 10;

        console.log(`🔌 Testing external APIs at ${lat}, ${lng}`);
        console.log(
          `📊 Generating ${maxEvents} mixed events (70% external, 30% synthetic)`,
        );

        try {
          const events = await regionIngestion.generateMixedEvents({
            lat,
            lng,
            radius: 1600, // 1.6km
            maxEvents,
            eventSourceMix: { external: 70, synthetic: 30 },
          });

          console.log(`\n✅ Successfully generated ${events.length} events:`);
          events.forEach((event: any, idx) => {
            const source = event.source || 'region_synthetic';
            const bookingInfo = event.externalBookingUrl
              ? '🔗 External booking'
              : '📋 Internal plans';
            console.log(
              `   ${idx + 1}. [${source.toUpperCase()}] ${event.title} - ${bookingInfo}`,
            );
          });

          // Group by source
          const bySource = events.reduce(
            (acc: Record<string, number>, event: any) => {
              const source = event.source || 'region_synthetic';
              acc[source] = (acc[source] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );

          console.log('\n📈 Source breakdown:');
          Object.entries(bySource).forEach(([source, count]) => {
            console.log(`   ${source}: ${count} events`);
          });
        } catch (error) {
          console.error(`❌ External API test failed: ${error.message}`);
        }
        break;
      }
      case 'external:apis:status': {
        console.log('🔍 Checking external API status...\n');

        const apis = [
          {
            name: 'External APIs',
            enabled: process.env.EXTERNAL_APIS_ENABLED === 'true',
          },
          {
            name: 'Yelp Fusion',
            enabled: process.env.YELP_API_ENABLED === 'true',
            key: !!process.env.YELP_API_KEY,
          },
          {
            name: 'Meetup GraphQL',
            enabled: process.env.MEETUP_API_ENABLED === 'true',
            key: !!process.env.MEETUP_ACCESS_TOKEN,
          },
          {
            name: 'NYC Parks',
            enabled: process.env.NYC_PARKS_API_ENABLED === 'true',
            key: true,
          },
        ];

        apis.forEach((api) => {
          const status =
            api.enabled && api.key !== false ? '✅ Enabled' : '❌ Disabled';
          const keyStatus = api.key === false ? ' (Missing API key)' : '';
          console.log(`${api.name}: ${status}${keyStatus}`);
        });

        console.log(
          `\nEvent mix: ${process.env.DEFAULT_EXTERNAL_PERCENTAGE || 70}% external, ${process.env.DEFAULT_SYNTHETIC_PERCENTAGE || 30}% synthetic`,
        );
        break;
      }
      case 'external:ticketmaster': {
        console.log('🎫 Testing Ticketmaster Discovery API...\n');

        const ticketmaster = app.get(TicketmasterDiscoveryService);
        const lat = parseFloat(argv[0]) || 40.7484;
        const lng = parseFloat(argv[1]) || -73.9857;
        const limit = parseInt(argv[2]) || 5;

        if (!ticketmaster.isEnabled()) {
          console.error('❌ Ticketmaster API is not enabled');
          console.log('Set TICKETMASTER_API_KEY in your .env file');
          break;
        }

        try {
          const events = await ticketmaster.searchEvents({
            lat,
            lng,
            radius: 5000,
            limit,
          });

          console.log(`✅ Found ${events.length} Ticketmaster events:\n`);

          events.forEach((event: any, idx) => {
            console.log(`${idx + 1}. 🎫 ${event.title}`);
            console.log(`   📍 ${event.venue} - ${event.address}`);
            console.log(`   📅 ${event.startTime.toLocaleDateString()}`);
            console.log(`   💰 ${event.priceDisplay || 'Price TBA'}`);
            console.log(`   🔗 ${event.externalBookingUrl}`);
            console.log(
              `   🏷️  ${event.categories?.join(', ') || 'entertainment'}\n`,
            );
          });
        } catch (error: any) {
          console.error(`❌ Ticketmaster test failed: ${error.message}`);
        }
        break;
      }
      case 'demo:enhanced-event': {
        console.log(
          '🎭 Generating enhanced demo event with new AI features...\n',
        );

        const regionIngestion = app.get(RegionIngestionService);
        const lat = parseFloat(argv[0]) || 40.7259;
        const lng = parseFloat(argv[1]) || -74.0056;
        const vibeKey = argv[2] || 'ARTSY';

        try {
          console.log(
            `📍 Creating ${vibeKey} event at coordinates ${lat}, ${lng}`,
          );

          const event = await regionIngestion.generateRegionEvent({
            region: { lat, lng },
            vibeKey: vibeKey as any,
            searchRadiusM: 1000,
            startTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
            endTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
          });
          if (!event) return null;
          console.log(`\n✅ Enhanced event created successfully!`);
          console.log(`📋 Event ID: ${event.id}`);
          console.log(`🎯 Title: ${event.title}`);
          console.log(`🎨 Vibe: ${event.vibeKey}`);
          console.log(
            `📸 Gallery: ${event.gallery?.length || 0} optimized photos`,
          );
          console.log(`📱 Plans: ${event.plans?.length || 0} enhanced plans`);

          if (event.plans && event.plans.length > 0) {
            console.log('\n🗺️ Plan Details:');
            event.plans.forEach((plan: any, idx: number) => {
              console.log(`\n   Plan ${idx + 1}: ${plan.emoji} ${plan.title}`);
              console.log(`   📝 ${plan.description}`);
            });
          }

          console.log(
            `\n📊 AI Analysis complete with enhanced vibe descriptions and photo optimization`,
          );
        } catch (error: any) {
          console.error(
            `❌ Enhanced event generation failed: ${error.message}`,
          );
        }
        break;
      }
      case 'external:yelp': {
        console.log('🍽️ Testing Yelp Fusion API with AI integration...\n');

        const {
          YelpFusionService,
        } = require('../modules/external-apis/services/yelp-fusion.service');
        const yelp = app.get(YelpFusionService);
        const ai = app.get(AIService);
        const prisma = app.get(PrismaService);

        const lat = parseFloat(argv[0]) || 40.7589;
        const lng = parseFloat(argv[1]) || -73.9851;
        const limit = parseInt(argv[2]) || 5;

        console.log(
          `📍 Using coordinates: lat=${lat}, lng=${lng}, limit=${limit}`,
        );

        // Force Yelp credentials for CLI testing
        const YELP_API_KEY =
          'I3YaYUht5wErVqUbH2AxtOhy4I9865deU3Aykv--n9Qimoq2cCisvrV70kfjS8fVAYaPdA0qfF8g0mmZj4o7R3HRCEyo_sgaKGkgbXfxkPHHu8T2F8GDysSGA0SwaHYx';

        console.log(`🔧 Using hardcoded Yelp API key for testing`);

        // Manual check instead of relying on env
        if (!YELP_API_KEY) {
          console.error('❌ Yelp API key not available');
          break;
        }

        try {
          // Use single category to avoid timeout - get cocktail bars in NYC
          const yelpBusinesses = await fetch(
            `https://api.yelp.com/v3/businesses/search?latitude=${lat}&longitude=${lng}&radius=10000&categories=cocktailbars&limit=${limit}`,
            {
              headers: {
                Authorization: `Bearer ${YELP_API_KEY}`,
              },
            },
          );

          if (!yelpBusinesses.ok) {
            throw new Error(`Yelp API error: ${yelpBusinesses.status}`);
          }

          const yelpData = await yelpBusinesses.json();
          console.log(
            `✅ Found ${yelpData.businesses?.length || 0} real NYC businesses from Yelp:\n`,
          );

          let createdEvents = 0;
          let failedEvents = 0;

          for (const business of yelpData.businesses || []) {
            const eventTitle = determineEventTitle(business);
            console.log(`🎯 ${eventTitle}`);
            console.log(
              `   📍 ${business.name} - ${business.location?.display_address?.join(', ')}`,
            );
            console.log(
              `   ⭐ Rating: ${business.rating}/5.0 (${business.review_count} reviews)`,
            );
            console.log(`   💰 Price: ${business.price || 'Not specified'}`);
            console.log(
              `   🏷️  Categories: ${business.categories?.map((c: any) => c.title).join(', ')}`,
            );
            console.log(
              `   📞 Phone: ${business.display_phone || 'Not provided'}`,
            );
            console.log(`   🌐 ${business.url}`);

            try {
              // Fetch detailed business info with hours
              let businessHours = null;
              try {
                const businessDetail = await fetch(
                  `https://api.yelp.com/v3/businesses/${business.id}`,
                  {
                    headers: {
                      Authorization: `Bearer ${YELP_API_KEY}`,
                    },
                  },
                );
                if (businessDetail.ok) {
                  const detailData = await businessDetail.json();
                  businessHours = detailData.hours?.[0]; // First set of hours
                  console.log(
                    `   🕐 Business hours available: ${businessHours ? 'Yes' : 'No'}`,
                  );
                }
              } catch (hoursError) {
                console.log(
                  `   ⚠️ Could not fetch business hours: ${hoursError.message}`,
                );
              }

              // Generate realistic event times based on business hours
              const eventStartTime = generateEventStartTime(businessHours);
              const eventEndTime = generateEventEndTime(eventStartTime);
              console.log(
                `   📅 Event time: ${eventStartTime.toLocaleString()} - ${eventEndTime.toLocaleString()}`,
              );

              // Save event to database using proper structure like ingest:nyc
              const savedEvent = await prisma.event.upsert({
                where: {
                  source_sourceId: {
                    source: 'yelp_fusion',
                    sourceId: business.id,
                  },
                },
                update: {
                  title: eventTitle,
                  venue: business.name,
                  address:
                    business.location?.display_address?.join(', ') || null,
                  rating: business.rating
                    ? new Prisma.Decimal(business.rating)
                    : null,
                  externalBookingUrl: business.url || null,
                  lat: business.coordinates?.latitude
                    ? new Prisma.Decimal(business.coordinates.latitude)
                    : null,
                  lng: business.coordinates?.longitude
                    ? new Prisma.Decimal(business.coordinates.longitude)
                    : null,
                },
                create: {
                  source: 'yelp_fusion',
                  sourceId: business.id,
                  title: eventTitle,
                  description: `${business.categories?.map((c: any) => c.title).join(', ')} experience at ${business.name}. Located in ${business.location?.city}, this venue has ${business.rating}⭐ rating from ${business.review_count} reviews on Yelp.`,
                  venue: business.name,
                  address:
                    business.location?.display_address?.join(', ') || null,
                  rating: business.rating
                    ? new Prisma.Decimal(business.rating)
                    : null,
                  priceLevel: mapYelpPriceToLevel(business.price),
                  externalBookingUrl: business.url || null,
                  lat: business.coordinates?.latitude
                    ? new Prisma.Decimal(business.coordinates.latitude)
                    : null,
                  lng: business.coordinates?.longitude
                    ? new Prisma.Decimal(business.coordinates.longitude)
                    : null,
                  startTime: eventStartTime,
                  endTime: eventEndTime,
                  votingState: 'NOT_STARTED',
                },
              });

              // Full AI integration like region:ingest
              console.log(`   🤖 Generating AI vibe analysis and plans...`);
              try {
                // 1. First analyze the business vibe based on Yelp data
                const aiVibeAnalysis = await ai.analyzeEventVibe({
                  regionName: business.location?.city || 'NYC',
                  venues: [
                    {
                      name: business.name,
                      address:
                        business.location?.display_address?.join(', ') || '',
                      types:
                        business.categories?.map((c: any) => c.alias) || [],
                      tags: business.categories?.map((c: any) => c.title) || [],
                      rating: business.rating || 0,
                      priceLevel: mapYelpPriceToLevel(business.price),
                    },
                  ],
                });

                console.log(
                  `      🧠 Detected vibe: ${aiVibeAnalysis.vibeKey}`,
                );

                // 2. Generate plans with the detected vibe
                const aiPlans = await ai.buildTwoPlans({
                  title: savedEvent.title,
                  venue: savedEvent.venue || undefined,
                  address: savedEvent.address || undefined,
                  start: savedEvent.startTime?.toISOString(),
                });

                // 3. Generate specific plan vibe analysis
                const planVibesAnalysis = await ai.analyzePlanVibes({
                  eventTitle: savedEvent.title,
                  regionName: business.location?.city || 'NYC',
                  plans: aiPlans,
                  venues: [
                    {
                      name: business.name,
                      address:
                        business.location?.display_address?.join(', ') || '',
                      types:
                        business.categories?.map((c: any) => c.alias) || [],
                      rating: business.rating || 0,
                      priceLevel: mapYelpPriceToLevel(business.price),
                    },
                  ],
                });

                // 4. Update event with AI analysis and images
                await prisma.event.update({
                  where: { id: savedEvent.id },
                  data: {
                    vibeKey: aiVibeAnalysis.vibeKey as any,
                    vibeAnalysis: planVibesAnalysis.overallEventVibe,
                    aiNormalized: {
                      ...aiVibeAnalysis,
                      vibeAnalysis: planVibesAnalysis.overallEventVibe,
                      planAnalyses: {
                        plan1: planVibesAnalysis.plan1Analysis,
                        plan2: planVibesAnalysis.plan2Analysis,
                      },
                    },
                    imageUrl: business.image_url || null, // Use Yelp image
                    gallery:
                      business.photos || [business.image_url].filter(Boolean), // Yelp photos
                  },
                });

                // 5. Create plans in database (only if none exist)
                const existingPlansCount = await prisma.plan.count({
                  where: { eventId: savedEvent.id },
                });

                if (existingPlansCount === 0) {
                  for (let i = 0; i < aiPlans.length && i < 2; i++) {
                    const plan = aiPlans[i];
                    await prisma.plan.create({
                      data: {
                        eventId: savedEvent.id,
                        title: plan.title,
                        description: plan.description,
                        emoji: plan.emoji,
                        venue: savedEvent.venue,
                        address: savedEvent.address,
                        lat: savedEvent.lat,
                        lng: savedEvent.lng,
                        rating: savedEvent.rating,
                        priceLevel: savedEvent.priceLevel,
                        externalBookingUrl: savedEvent.externalBookingUrl,
                      },
                    });
                  }
                } else {
                  console.log(
                    `      ⚠️ Plans already exist (${existingPlansCount} plans), skipping creation`,
                  );
                }

                console.log(
                  `      ✅ Created ${aiPlans.length} AI-generated plans with vibe analysis`,
                );
                console.log(
                  `      🎨 Vibe: ${planVibesAnalysis.overallEventVibe}`,
                );
              } catch (aiError: any) {
                if (
                  aiError.message?.includes('quota') ||
                  aiError.message?.includes('429')
                ) {
                  console.log(
                    `      ⚠️ Google AI Free Tier quota exceeded - no fallback implemented`,
                  );
                  console.log(
                    `      💡 Event saved without AI analysis. Consider upgrading Google AI plan.`,
                  );
                  // Stop processing more events to avoid more quota errors
                  console.log(
                    `\n🛑 Stopping AI processing due to quota limits`,
                  );
                  console.log(
                    `✅ Successfully created ${createdEvents} events before quota limit`,
                  );
                  break;
                } else {
                  console.log(
                    `      ⚠️ AI integration failed: ${aiError.message}`,
                  );
                }
              }

              console.log(`   💾 Event saved with ID: ${savedEvent.id}\n`);
              createdEvents++;
            } catch (dbError: any) {
              console.error(`   ❌ Database save failed: ${dbError.message}\n`);
              failedEvents++;
            }
          }

          console.log(
            `\n🎯 Summary: ${createdEvents} events created, ${failedEvents} failed`,
          );
        } catch (error: any) {
          console.error(`❌ Yelp test failed: ${error.message}`);
        }
        break;
      }
      case 'seed:all': {
        console.log('🌱 Running complete database seed...\n');
        const seedService = app.get(SeedService);
        await seedService.seedAll();
        console.log('\n✅ Database seed completed successfully!');
        break;
      }

      case 'daily:ingest':
        {
          console.log('🔄 Starting daily event ingestion for NYC...\n');

          const ai = app.get(AIService);
          const regionIngestion = app.get(RegionIngestionService);
          const prisma = app.get(PrismaService);

          // 1. CRITICAL: Test AI health first
          console.log('🧪 Testing AI health...');
          try {
            const testResponse = await ai.buildTwoPlans({
              title: 'Health Check Event',
              venue: 'Test Venue',
              address: 'NYC',
              start: new Date().toISOString(),
            });
            if (!testResponse || testResponse.length === 0)
              throw new Error('AI response is empty');
            console.log('✅ AI is healthy and responding\n');
          } catch (aiError: any) {
            console.error('❌ AI HEALTH CHECK FAILED - STOPPING IMMEDIATELY');
            console.error(`   Error: ${aiError.message}`);
            if (aiError.message?.includes('quota')) {
              console.error(
                '   💳 Google AI quota exceeded. Please upgrade your plan.',
              );
            }
            console.error('\n⛔ Cannot proceed without AI. Exiting.');
            process.exit(1);
          }

          // 2. Define NYC regions for comprehensive coverage
          const nycRegions = [
            // Manhattan
            {
              name: 'SoHo, Manhattan',
              lat: 40.7223,
              lng: -74.002,
              vibe: 'ARTSY',
            },
            {
              name: 'Tribeca, Manhattan',
              lat: 40.7163,
              lng: -74.0086,
              vibe: 'CHILL',
            },
            {
              name: 'Chelsea, Manhattan',
              lat: 40.7465,
              lng: -74.0014,
              vibe: 'DATE_NIGHT',
            },
            {
              name: 'East Village, Manhattan',
              lat: 40.7264,
              lng: -73.9818,
              vibe: 'PARTY',
            },
            {
              name: 'West Village, Manhattan',
              lat: 40.7358,
              lng: -74.0036,
              vibe: 'CULTURAL',
            },
            {
              name: 'Upper East Side, Manhattan',
              lat: 40.7736,
              lng: -73.9566,
              vibe: 'RELAXED',
            },
            {
              name: 'Upper West Side, Manhattan',
              lat: 40.787,
              lng: -73.9754,
              vibe: 'MORNING',
            },
            {
              name: 'Midtown, Manhattan',
              lat: 40.7549,
              lng: -73.984,
              vibe: 'SOCIAL',
            },
            {
              name: 'Financial District, Manhattan',
              lat: 40.7074,
              lng: -74.0113,
              vibe: 'PROFESSIONAL',
            },
            // Brooklyn
            {
              name: 'Williamsburg, Brooklyn',
              lat: 40.7081,
              lng: -73.9571,
              vibe: 'ARTSY',
            },
            {
              name: 'DUMBO, Brooklyn',
              lat: 40.7033,
              lng: -73.9881,
              vibe: 'DATE_NIGHT',
            },
            {
              name: 'Park Slope, Brooklyn',
              lat: 40.6681,
              lng: -73.9806,
              vibe: 'RELAXED',
            },
            {
              name: 'Brooklyn Heights, Brooklyn',
              lat: 40.696,
              lng: -73.9929,
              vibe: 'CULTURAL',
            },
            // Queens
            {
              name: 'Astoria, Queens',
              lat: 40.772,
              lng: -73.9304,
              vibe: 'SOCIAL',
            },
            {
              name: 'Long Island City, Queens',
              lat: 40.7447,
              lng: -73.9485,
              vibe: 'CHILL',
            },
            {
              name: 'Flushing, Queens',
              lat: 40.7674,
              lng: -73.833,
              vibe: 'CULTURAL',
            },
          ];

          // 3. Rotate regions based on day of week to avoid duplicates
          const dayOfWeek = new Date().getDay();
          const regionStartIndex = (dayOfWeek * 3) % nycRegions.length;
          const regionsToday: typeof nycRegions = [];
          for (let i = 0; i < 5; i++) {
            regionsToday.push(
              nycRegions[(regionStartIndex + i) % nycRegions.length],
            );
          }

          console.log(`📍 Today's regions (Day ${dayOfWeek}):`);
          regionsToday.forEach((r) => console.log(`   - ${r.name}`));
          console.log('');

          let totalCreated = 0;
          let totalFailed = 0;
          const maxEventsPerRegion = parseInt(argv[0]) || 3;

          // 4. Process each region with mixed sources
          for (const region of regionsToday) {
            console.log(`\n🌆 Processing ${region.name}...`);

            try {
              // Test AI before each region (critical) - use simpler test
              await ai.analyzeEventVibe({
                regionName: region.name,
                venues: [],
              });

              // Generate mixed events (external APIs + Google Places)
              const events = await regionIngestion.generateMixedEvents({
                lat: region.lat,
                lng: region.lng,
                radius: 1200,
                maxEvents: maxEventsPerRegion,
                eventSourceMix: {
                  external: 60, // Yelp, Ticketmaster, etc
                  synthetic: 40, // Google Places region events
                },
              });

              console.log(
                `   ✅ Created ${events.length} events in ${region.name}`,
              );

              // Log source breakdown
              const bySource = events.reduce((acc: any, e: any) => {
                acc[e.source || 'synthetic'] =
                  (acc[e.source || 'synthetic'] || 0) + 1;
                return acc;
              }, {});
              Object.entries(bySource).forEach(([src, count]) => {
                console.log(`      ${src}: ${count}`);
              });

              totalCreated += events.length;
            } catch (error: any) {
              console.error(`   ❌ Failed ${region.name}: ${error.message}`);

              // CRITICAL: Stop if AI fails
              if (
                error.message?.includes('quota') ||
                error.message?.includes('AI')
              ) {
                console.error(
                  '\n⛔ AI ERROR DETECTED - STOPPING ALL PROCESSING',
                );
                console.error(
                  `   Created ${totalCreated} events before failure`,
                );
                process.exit(1);
              }

              totalFailed++;
            }
          }

          // 5. Summary
          console.log('\n' + '='.repeat(60));
          console.log('📊 DAILY INGESTION COMPLETE');
          console.log('='.repeat(60));
          console.log(`✅ Total events created: ${totalCreated}`);
          console.log(`❌ Total regions failed: ${totalFailed}`);
          console.log(`📅 Next run: Tomorrow at same time`);

          // 6. Clean old events (optional)
          const cleanOldEvents = argv.includes('--clean');
          if (cleanOldEvents) {
            console.log('\n🧹 Cleaning events older than 30 days...');
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const deleted = await prisma.event.deleteMany({
              where: {
                createdAt: { lt: thirtyDaysAgo },
                members: { none: {} }, // Only delete if no members
              },
            });
            console.log(`   Deleted ${deleted.count} old events`);
          }

          break;
        }

        // Helper functions for Yelp integration - use real business data
        function determineEventTitle(business: any): string {
          const categories =
            business.categories?.map((c: any) => c.alias) || [];
          const categoryTitles =
            business.categories?.map((c: any) => c.title) || [];

          // Use real Yelp category data for better event titles
          if (
            categories.includes('wine_bars') ||
            categories.includes('wineries')
          )
            return `Wine Experience at ${business.name}`;
          if (
            categories.includes('cooking_classes') ||
            categoryTitles.some((t: string) =>
              t.toLowerCase().includes('cooking'),
            )
          )
            return `Cooking Experience at ${business.name}`;
          if (
            categories.includes('art_galleries') ||
            categories.includes('museums')
          )
            return `Cultural Experience at ${business.name}`;
          if (categories.includes('spas') || categories.includes('massage'))
            return `Wellness Experience at ${business.name}`;
          if (categories.includes('yoga') || categories.includes('fitness'))
            return `Fitness Experience at ${business.name}`;
          if (
            categories.includes('breweries') ||
            categories.includes('cocktailbars')
          )
            return `Drinks Experience at ${business.name}`;
          if (
            categoryTitles.some((t: string) =>
              t.toLowerCase().includes('class'),
            )
          )
            return `Class at ${business.name}`;

          // Default to the actual business category + experience
          const primaryCategory = categoryTitles[0] || 'Activity';
          return `${primaryCategory} Experience at ${business.name}`;
        }

        function mapYelpPriceToLevel(yelpPrice?: string): number {
          if (!yelpPrice) return 0;
          switch (yelpPrice) {
            case '$':
              return 1;
            case '$$':
              return 2;
            case '$$$':
              return 3;
            case '$$$$':
              return 4;
            default:
              return 0;
          }
        }

        function generateEventStartTime(businessHours?: any): Date {
          // Generate event for upcoming weekend (Friday or Saturday)
          const today = new Date();
          const daysUntilFriday = (5 - today.getDay() + 7) % 7;
          const eventDate = new Date();
          eventDate.setDate(
            today.getDate() + (daysUntilFriday === 0 ? 1 : daysUntilFriday),
          ); // Next Friday or Saturday

          // Use business hours if available, otherwise default to evening time
          if (businessHours?.open) {
            const todayHours = businessHours.open.find(
              (h: any) => h.day === eventDate.getDay(),
            );
            if (todayHours) {
              // Convert Yelp time format (HHMM) to Date
              const openTime = todayHours.start; // e.g., "1600" for 4 PM
              const closeTime = todayHours.end; // e.g., "0200" for 2 AM next day

              // Parse open time and add 1-2 hours for event start
              const openHour = Math.floor(parseInt(openTime) / 100);
              const eventHour = Math.min(
                openHour + Math.floor(Math.random() * 2) + 1,
                21,
              ); // Max 9 PM
              eventDate.setHours(eventHour, 0, 0, 0);
              return eventDate;
            }
          }

          // Default: evening event between 6-8 PM
          const hour = Math.floor(Math.random() * 3) + 18;
          eventDate.setHours(hour, 0, 0, 0);
          return eventDate;
        }

        function generateEventEndTime(startTime: Date): Date {
          const endTime = new Date(startTime);
          endTime.setHours(endTime.getHours() + 3); // 3 hour event
          return endTime;
        }

      default:
        console.error(`Unknown command: ${cmd}`);
        console.log('\nAvailable commands:');
        console.log(
          '  ingest:nyc [max]                 - Ingest Ticketmaster NYC events',
        );
        console.log(
          '  events:ai:build-plans <eventId> - Build AI plans for event',
        );
        console.log('  events:clear                     - Clear all events');
        console.log(
          '  ingest:regions [max]             - Generate region-based synthetic events',
        );
        console.log(
          '  external:test [lat] [lng] [max]  - Test external APIs (default: NYC, 10 events)',
        );
        console.log(
          '  external:apis:status             - Check external API configuration',
        );
        console.log(
          '  external:ticketmaster [lat] [lng] [limit] - Test Ticketmaster API (default: NYC, 5 events)',
        );
        console.log(
          '  external:yelp [lat] [lng] [limit]        - Test Yelp Fusion API with AI integration (default: NYC, 5 events)',
        );
        console.log(
          '  demo:enhanced-event [lat] [lng] [vibe]   - Generate enhanced demo event with new AI features',
        );
        console.log(
          '  daily:ingest [maxPerRegion]              - Daily cron job to fetch events from all sources (default: 3 per region)',
        );
        console.log(
          '  seed:all                         - Run complete database seed',
        );
        process.exit(1);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
