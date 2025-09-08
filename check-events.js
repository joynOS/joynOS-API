const { PrismaClient } = require('@prisma/client');

async function checkEvents() {
  const prisma = new PrismaClient();

  try {
    const events = await prisma.event.findMany({
      include: {
        plans: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log('📊 EVENTOS NO BANCO:');
    console.log(`Total: ${events.length} eventos\n`);

    events.forEach((event, i) => {
      console.log(`${i + 1}. ${event.title}`);
      console.log(`   ID: ${event.id}`);
      console.log(
        `   Source: ${event.source || 'SYNTHETIC'} ${event.externalId ? `| External ID: ${event.externalId}` : ''}`,
      );
      console.log(`   Created: ${new Date(event.createdAt).toLocaleString()}`);
      console.log(`   Vibe: ${event.vibeKey || 'N/A'}`);
      console.log(`   Plans: ${event.plans.length}`);

      event.plans.forEach((plan, j) => {
        console.log(`      ${j + 1}. ${plan.title} ${plan.emoji || ''}`);
        if (plan.timeline) {
          console.log(
            `         Timeline: ${plan.timeline.substring(0, 50)}...`,
          );
        }
        if (plan.vibe) {
          console.log(`         Vibe: ${plan.vibe}`);
        }
      });
      console.log('');
    });

    // Check for vibe analysis data
    const eventsWithVibeAnalysis = events.filter((e) => e.vibeAnalysis);
    console.log(
      `\n✅ Eventos with vibe analysis: ${eventsWithVibeAnalysis.length}/${events.length}`,
    );

    const eventsWithPlanTimelines = events.filter((e) =>
      e.plans.some((p) => p.timeline),
    );
    console.log(
      `✅ Eventos with plan timelines: ${eventsWithPlanTimelines.length}/${events.length}`,
    );

    const eventsWithPlanVibes = events.filter((e) =>
      e.plans.some((p) => p.vibe),
    );
    console.log(
      `✅ Eventos with plan vibes: ${eventsWithPlanVibes.length}/${events.length}`,
    );
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEvents();
