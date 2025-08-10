import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const interests = [
  { slug: 'jazz-music', emoji: '🎵', label: 'Jazz Music' },
  { slug: 'live-music', emoji: '🎶', label: 'Live Music' },
  { slug: 'theater', emoji: '🎭', label: 'Theater' },
  { slug: 'art-galleries', emoji: '🎨', label: 'Art Galleries' },
  { slug: 'wine-tasting', emoji: '🍷', label: 'Wine Tasting' },
  { slug: 'food-tours', emoji: '🍽️', label: 'Food Tours' },
  { slug: 'museums', emoji: '🏛️', label: 'Museums' },
  { slug: 'gaming', emoji: '🎮', label: 'Gaming' },
  { slug: 'karaoke', emoji: '🎤', label: 'Karaoke' },
  { slug: 'games', emoji: '🕹️', label: 'Games' },
  { slug: 'running', emoji: '🏃', label: 'Running' },
  { slug: 'hiking', emoji: '🥾', label: 'Hiking' },
  { slug: 'photography', emoji: '📸', label: 'Photography' },
  { slug: 'meditation', emoji: '🧘', label: 'Meditation' },
  { slug: 'travel', emoji: '✈️', label: 'Travel' },
  { slug: 'comedy-shows', emoji: '😂', label: 'Comedy Shows' },
  { slug: 'beach-days', emoji: '🏖️', label: 'Beach Days' },
  { slug: 'cooking', emoji: '👩‍🍳', label: 'Cooking' },
  { slug: 'gardening', emoji: '🌿', label: 'Gardening' },
  { slug: 'coffee', emoji: '☕', label: 'Coffee' },
]

async function main() {
  await prisma.interest.createMany({ data: interests, skipDuplicates: true })
  console.log('Interests seeded')
}

main().finally(async () => {
  await prisma.$disconnect()
})
