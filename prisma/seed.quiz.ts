import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const QUIZ_QUESTIONS = [
  {
    id: 1,
    image:
      'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&h=600&fit=crop',
    question: "At a party, you're most likely to be:",
    answers: [
      {
        id: 'a',
        text: 'The DJ controlling the music and energy',
        archetype: 'energetic',
      },
      {
        id: 'b',
        text: 'Deep in conversation with one fascinating person',
        archetype: 'thoughtful',
      },
      {
        id: 'c',
        text: "The host making sure everyone's having fun",
        archetype: 'connector',
      },
      {
        id: 'd',
        text: 'Observing the social dynamics from a cozy corner',
        archetype: 'observer',
      },
    ],
  },
  {
    id: 2,
    image:
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&h=600&fit=crop',
    question: 'Your ideal vacation is:',
    answers: [
      {
        id: 'a',
        text: 'Backpacking through unexplored places with no set plans',
        archetype: 'adventurer',
      },
      {
        id: 'b',
        text: 'A detailed itinerary hitting all the must-see spots',
        archetype: 'planner',
      },
      {
        id: 'c',
        text: 'Somewhere you can help locals or volunteer',
        archetype: 'helper',
      },
      {
        id: 'd',
        text: 'A peaceful retreat where you can think and recharge',
        archetype: 'contemplative',
      },
    ],
  },
  {
    id: 3,
    image:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop',
    question: 'When making decisions, you:',
    answers: [
      { id: 'a', text: 'Go with your gut immediately', archetype: 'intuitive' },
      {
        id: 'b',
        text: 'Research every possible angle first',
        archetype: 'analytical',
      },
      {
        id: 'c',
        text: 'Consider how it affects everyone involved',
        archetype: 'empathetic',
      },
      {
        id: 'd',
        text: 'Follow a logical system or framework',
        archetype: 'systematic',
      },
    ],
  },
  {
    id: 4,
    image:
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&h=600&fit=crop',
    question: 'Your friends describe you as:',
    answers: [
      {
        id: 'a',
        text: 'The one who makes things happen',
        archetype: 'catalyst',
      },
      {
        id: 'b',
        text: 'The one who keeps everyone grounded',
        archetype: 'stabilizer',
      },
      {
        id: 'c',
        text: "The one who remembers everyone's birthdays",
        archetype: 'caretaker',
      },
      {
        id: 'd',
        text: 'The one with the most interesting ideas',
        archetype: 'innovator',
      },
    ],
  },
  {
    id: 5,
    image:
      'https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=800&h=600&fit=crop',
    question: 'Under pressure, you:',
    answers: [
      {
        id: 'a',
        text: 'Thrive and get energized by the challenge',
        archetype: 'challenger',
      },
      {
        id: 'b',
        text: 'Stay calm and work through it systematically',
        archetype: 'steady',
      },
      {
        id: 'c',
        text: 'Rally everyone together as a team',
        archetype: 'unifier',
      },
      {
        id: 'd',
        text: 'Need quiet time to process and plan',
        archetype: 'processor',
      },
    ],
  },
  {
    id: 6,
    image:
      'https://images.unsplash.com/photo-1497032628192-86f99bcd76bc?w=800&h=600&fit=crop',
    question: 'Your ideal work environment is:',
    answers: [
      {
        id: 'a',
        text: 'Fast-paced with lots of variety and interaction',
        archetype: 'dynamic',
      },
      {
        id: 'b',
        text: 'Stable with clear expectations and processes',
        archetype: 'structured',
      },
      {
        id: 'c',
        text: 'Collaborative with opportunities to help others',
        archetype: 'collaborative',
      },
      {
        id: 'd',
        text: 'Independent with time for deep thinking',
        archetype: 'independent',
      },
    ],
  },
  {
    id: 7,
    image:
      'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&h=600&fit=crop',
    question: "You're most proud of:",
    answers: [
      {
        id: 'a',
        text: 'Taking risks that paid off big',
        archetype: 'risk-taker',
      },
      {
        id: 'b',
        text: 'Building something lasting and reliable',
        archetype: 'builder',
      },
      {
        id: 'c',
        text: "Making a positive difference in someone's life",
        archetype: 'impact-maker',
      },
      {
        id: 'd',
        text: "Solving a complex problem others couldn't",
        archetype: 'problem-solver',
      },
    ],
  },
  {
    id: 8,
    image:
      'https://images.unsplash.com/photo-1573164713712-03790a178651?w=800&h=600&fit=crop',
    question: 'Your secret superpower is:',
    answers: [
      {
        id: 'a',
        text: 'Reading the room and knowing what people need',
        archetype: 'empath',
      },
      {
        id: 'b',
        text: 'Seeing patterns others miss',
        archetype: 'pattern-matcher',
      },
      {
        id: 'c',
        text: 'Getting people excited about possibilities',
        archetype: 'inspirer',
      },
      {
        id: 'd',
        text: "Staying level-headed when everything's chaos",
        archetype: 'anchor',
      },
    ],
  },
] as const;

async function main() {
  const quiz = await prisma.quiz.upsert({
    where: { key: 'onboarding-v1' },
    update: { isActive: true, title: 'Onboarding Quiz' },
    create: { key: 'onboarding-v1', title: 'Onboarding Quiz', isActive: true },
  });
  await prisma.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
  for (const q of QUIZ_QUESTIONS) {
    const question = await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        order: q.id,
        imageUrl: q.image,
        question: q.question,
      },
    });
    for (const a of q.answers) {
      await prisma.quizAnswer.create({
        data: {
          questionId: question.id,
          key: a.id,
          text: a.text,
          archetype: a.archetype,
        },
      });
    }
  }
  console.log('Quiz seeded');
}

main().finally(async () => {
  await prisma.$disconnect();
});
