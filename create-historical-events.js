// Script simples para criar eventos históricos
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const USER_ID = '628b2526-05e7-4556-b6c8-e94d4c92a16b';

const eventTemplates = [
  {
    title: "Brooklyn Art Gallery Opening",
    description: "Exclusive preview of contemporary artists featuring emerging photographers from NYC",
    venue: "Brooklyn Art Space",
    address: "123 Atlantic Ave, Brooklyn, NY",
    vibeKey: "ARTSY",
    category: "art",
    imageUrl: "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&h=600&fit=crop"
  },
  {
    title: "Rooftop Jazz & Wine Night",
    description: "Intimate jazz performance with wine tasting overlooking Manhattan skyline", 
    venue: "Sky Terrace",
    address: "456 Fifth Ave, Manhattan, NY",
    vibeKey: "DATE_NIGHT",
    category: "music",
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=600&fit=crop"
  },
  {
    title: "Food Photography Workshop",
    description: "Hands-on workshop learning professional food photography techniques",
    venue: "The Photography Studio", 
    address: "789 Soho St, Manhattan, NY",
    vibeKey: "CHILL",
    category: "photography",
    imageUrl: "https://images.unsplash.com/photo-1556909114-28e2e5d58e20?w=800&h=600&fit=crop"
  },
  {
    title: "Comedy Night at Village Underground",
    description: "Stand-up comedy featuring rising stars and surprise guest appearances",
    venue: "Village Underground",
    address: "130 W 3rd St, New York, NY",
    vibeKey: "CHILL", 
    category: "comedy",
    imageUrl: "https://images.unsplash.com/photo-1527224531-69d3ad20fe65?w=800&h=600&fit=crop"
  },
  {
    title: "Whitney Museum Modern Art Exhibition",
    description: "Contemporary art showcase featuring international artists",
    venue: "Whitney Museum",
    address: "99 Gansevoort St, New York, NY", 
    vibeKey: "CULTURAL",
    category: "art",
    imageUrl: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=600&fit=crop"
  },
  {
    title: "Central Park Picnic & Music Festival",
    description: "Outdoor music festival with food trucks and local bands",
    venue: "Central Park",
    address: "Central Park, New York, NY",
    vibeKey: "SOCIAL",
    category: "music",
    imageUrl: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&h=600&fit=crop"
  },
  {
    title: "Wine Tasting in SoHo",
    description: "Curated wine experience featuring natural wines from small vineyards",
    venue: "SoHo Wine Bar",
    address: "234 Spring St, New York, NY",
    vibeKey: "DATE_NIGHT",
    category: "food", 
    imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=600&fit=crop"
  },
  {
    title: "Hamilton on Broadway",
    description: "Award-winning musical about Alexander Hamilton and the founding fathers",
    venue: "Richard Rodgers Theatre",
    address: "226 W 46th St, New York, NY",
    vibeKey: "CULTURAL",
    category: "theater",
    imageUrl: "https://images.unsplash.com/photo-1507924538820-ede94a04019d?w=800&h=600&fit=crop"
  },
  {
    title: "Brooklyn Bridge Photography Walk", 
    description: "Golden hour photography session capturing NYC's iconic bridge",
    venue: "Brooklyn Bridge",
    address: "Brooklyn Bridge, New York, NY",
    vibeKey: "CHILL",
    category: "photography",
    imageUrl: "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=600&fit=crop"
  },
  {
    title: "Live Jazz at Blue Note",
    description: "Intimate jazz performance featuring Grammy-nominated artists",
    venue: "Blue Note",
    address: "131 W 3rd St, New York, NY", 
    vibeKey: "DATE_NIGHT",
    category: "music",
    imageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=600&fit=crop"
  }
];

function generateMockEmbedding() {
  return Buffer.from(Float32Array.from(new Array(768).fill(0).map(() => Math.random() * 0.2 - 0.1)).buffer);
}

async function createHistoricalEvents() {
  console.log('🎯 Creating 57 historical events for user:', USER_ID);
  
  // Check if user exists
  const user = await prisma.user.findUnique({ where: { id: USER_ID } });
  if (!user) {
    console.error('❌ User not found:', USER_ID);
    return;
  }
  
  let created = 0;
  
  for (let i = 0; i < 57; i++) {
    try {
      const template = eventTemplates[i % eventTemplates.length];
      
      // Generate historical date (6 months to 2 years ago)
      const daysAgo = Math.floor(Math.random() * 600) + 180; // 180-780 days ago
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);
      startDate.setHours(Math.floor(Math.random() * 6) + 18); // 6PM-12AM
      
      const endDate = new Date(startDate);
      endDate.setHours(startDate.getHours() + 3); // 3 hours later
      
      // Create event
      const event = await prisma.event.create({
        data: {
          source: 'historical',
          sourceId: `hist_${Date.now()}_${i}`,
          title: `${template.title} #${i + 1}`,
          description: template.description,
          imageUrl: template.imageUrl,
          gallery: [template.imageUrl],
          venue: template.venue,
          address: template.address,
          lat: '40.7589',
          lng: '-73.9851',
          startTime: startDate,
          endTime: endDate,
          vibeKey: template.vibeKey,
          vibeAnalysis: `Great ${template.vibeKey.toLowerCase()} experience in NYC`,
          embedding: generateMockEmbedding(),
        }
      });
      
      // Add user as member
      await prisma.member.create({
        data: {
          userId: USER_ID,
          eventId: event.id,
          status: i % 8 === 0 ? 'CANT_MAKE_IT' : 'JOINED'
        }
      });
      
      // Add review for some events  
      if (i % 4 === 0 && i % 8 !== 0) {
        const reviews = [
          'Amazing experience! Had such a great time.',
          'Loved every minute of it. Definitely recommend!', 
          'Perfect night out. Great venue and atmosphere.',
          'Incredible event! Exceeded my expectations.',
          'Great time with friends. Well organized.'
        ];
        
        await prisma.eventReview.create({
          data: {
            userId: USER_ID,
            eventId: event.id,
            placeRating: Math.floor(Math.random() * 2) + 4, // 4-5 stars
            planRating: Math.floor(Math.random() * 2) + 4, // 4-5 stars  
            comment: reviews[Math.floor(Math.random() * reviews.length)]
          }
        });
      }
      
      created++;
      if (created % 10 === 0) {
        console.log(`✅ Created ${created}/57 historical events...`);
      }
      
    } catch (error) {
      console.error(`❌ Error creating event ${i}:`, error.message);
    }
  }
  
  console.log(`🎉 Successfully created ${created} historical events for user!`);
}

createHistoricalEvents()
  .catch(console.error)
  .finally(() => prisma.$disconnect());