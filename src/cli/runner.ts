import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IngestionService } from '../modules/ingestion/ingestion.service';
import { PrismaService } from '../database/prisma.service';
import { AIService } from '../modules/ai/ai.service';
import { RegionIngestionService } from '../modules/ingestion/services/region-ingestion.service';

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
      default:
        console.error(`Unknown command: ${cmd}`);
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
