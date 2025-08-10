import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IngestionService } from '../modules/ingestion/ingestion.service';
import { PrismaService } from '../database/prisma.service';
import { AIService } from '../modules/ai/ai.service';

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
