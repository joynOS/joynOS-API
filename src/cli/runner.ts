import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IngestionService } from '../modules/ingestion/ingestion.service';
import { PrismaService } from '../database/prisma.service';
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

            console.log(`✅ Created: ${event.title} (${event.id})`);
            console.log(`   📋 Plans: ${event.plans?.length || 0}`);
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
      case 'seed:all': {
        console.log('🌱 Running complete database seed...\n');
        const seedService = app.get(SeedService);
        await seedService.seedAll();
        console.log('\n✅ Database seed completed successfully!');
        break;
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
          '  demo:enhanced-event [lat] [lng] [vibe]   - Generate enhanced demo event with new AI features',
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
