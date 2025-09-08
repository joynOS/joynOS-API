// Script para popular eventos com várias usuárias mulheres participando
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// IDs dos eventos recém-criados
const EVENT_IDS = [
  '51067002-50a1-4f96-89c1-68701d2c59b6', // SoHo — Artsy
  'cf9e8ea7-ea87-4037-a9bf-1fdb75169a27', // Williamsburg — Relaxed
];

// Estatísticas de participação realistas
const PARTICIPATION_STATS = {
  totalMembersRange: [8, 15], // Entre 8-15 pessoas por evento
  joinedPercentage: 0.7, // 70% ficam como JOINED
  committedPercentage: 0.2, // 20% se comprometem (COMMITTED)
  cantMakeItPercentage: 0.1, // 10% não conseguem ir
};

async function populateEventMembers() {
  console.log('👥 Populando eventos com participantes mulheres...');
  
  // Buscar usuárias mulheres existentes
  const existingUsers = await prisma.user.findMany({
    where: {
      name: {
        contains: 'a', // Nomes que terminam em 'a' (indicativo de nomes femininos)
      },
    },
    take: 50, // Pegar até 50 usuárias
  });
  
  console.log(`📋 Encontradas ${existingUsers.length} usuárias disponíveis`);
  
  if (existingUsers.length < 10) {
    console.log('⚠️  Poucas usuárias encontradas, criando usuárias adicionais...');
    await createAdditionalUsers();
    
    // Buscar novamente após criar
    const updatedUsers = await prisma.user.findMany({
      where: {
        name: {
          contains: 'a',
        },
      },
      take: 50,
    });
    existingUsers.push(...updatedUsers.slice(existingUsers.length));
  }

  for (const eventId of EVENT_IDS) {
    await populateSingleEvent(eventId, existingUsers);
  }
  
  console.log('🎉 Finalizado! Eventos populados com participantes.');
}

async function createAdditionalUsers() {
  const additionalUsers = [
    { name: 'Ana Clara', email: 'ana.clara@example.com' },
    { name: 'Beatriz Silva', email: 'beatriz.silva@example.com' },
    { name: 'Camila Santos', email: 'camila.santos@example.com' },
    { name: 'Daniela Costa', email: 'daniela.costa@example.com' },
    { name: 'Eduarda Lima', email: 'eduarda.lima@example.com' },
    { name: 'Fernanda Oliveira', email: 'fernanda.oliveira@example.com' },
    { name: 'Gabriela Souza', email: 'gabriela.souza@example.com' },
    { name: 'Helena Rodrigues', email: 'helena.rodrigues@example.com' },
    { name: 'Isabela Martins', email: 'isabela.martins@example.com' },
    { name: 'Julia Pereira', email: 'julia.pereira@example.com' },
    { name: 'Larissa Alves', email: 'larissa.alves@example.com' },
    { name: 'Mariana Gomes', email: 'mariana.gomes@example.com' },
    { name: 'Natália Ferreira', email: 'natalia.ferreira@example.com' },
    { name: 'Priscila Dias', email: 'priscila.dias@example.com' },
    { name: 'Renata Cardoso', email: 'renata.cardoso@example.com' },
  ];

  for (const userData of additionalUsers) {
    try {
      await prisma.user.upsert({
        where: { email: userData.email },
        update: {},
        create: {
          email: userData.email,
          name: userData.name,
          phone: `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
          avatar: `https://images.unsplash.com/photo-${1580000000000 + Math.floor(Math.random() * 100000000)}?w=400&h=400&fit=crop&crop=face`,
          bio: generateRandomBio(),
          embedding: generateMockEmbedding(),
        },
      });
    } catch (error) {
      console.warn(`Usuária ${userData.name} já existe, pulando...`);
    }
  }
  
  console.log(`✅ Criadas/verificadas ${additionalUsers.length} usuárias adicionais`);
}

function generateRandomBio() {
  const bios = [
    'Art enthusiast and coffee lover ☕️',
    'Exploring NYC one gallery at a time 🎨',
    'Weekend adventurer and foodie 🍴',
    'Creative soul with a passion for design ✨',
    'Music lover and cultural explorer 🎵',
    'Photography hobbyist and travel dreamer 📸',
    'Bookworm who loves discovering new places 📚',
    'Yoga practitioner and mindfulness advocate 🧘‍♀️',
    'Theatre enthusiast and wine connoisseur 🍷',
    'Dance lover and social butterfly 💃',
  ];
  return bios[Math.floor(Math.random() * bios.length)];
}

function generateMockEmbedding() {
  return Buffer.from(Float32Array.from(new Array(768).fill(0).map(() => Math.random() * 0.2 - 0.1)).buffer);
}

async function populateSingleEvent(eventId, availableUsers) {
  console.log(`\n📅 Populando evento: ${eventId}`);
  
  // Verificar se o evento existe
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true },
  });
  
  if (!event) {
    console.error(`❌ Evento não encontrado: ${eventId}`);
    return;
  }
  
  console.log(`📋 Evento encontrado: ${event.title}`);
  
  // Verificar membros já existentes
  const existingMembers = await prisma.member.findMany({
    where: { eventId },
    select: { userId: true },
  });
  
  const existingUserIds = new Set(existingMembers.map(m => m.userId));
  const availableForThisEvent = availableUsers.filter(u => !existingUserIds.has(u.id));
  
  // Determinar quantas pessoas adicionar
  const [minMembers, maxMembers] = PARTICIPATION_STATS.totalMembersRange;
  const targetMembers = Math.floor(Math.random() * (maxMembers - minMembers + 1)) + minMembers;
  const currentMembers = existingMembers.length;
  const membersToAdd = Math.max(0, targetMembers - currentMembers);
  
  console.log(`👥 Membros atuais: ${currentMembers}, Meta: ${targetMembers}, Adicionando: ${membersToAdd}`);
  
  if (membersToAdd === 0) {
    console.log('✅ Evento já tem membros suficientes');
    return;
  }
  
  // Selecionar usuárias aleatoriamente
  const selectedUsers = availableForThisEvent
    .sort(() => Math.random() - 0.5)
    .slice(0, membersToAdd);
  
  if (selectedUsers.length === 0) {
    console.log('⚠️  Não há usuárias disponíveis para este evento');
    return;
  }
  
  // Criar participações com status realistas
  for (const user of selectedUsers) {
    const status = getRandomMemberStatus();
    const bookingStatus = status === 'CANT_MAKE_IT' ? 'NONE' : 'BOOKED';
    
    try {
      await prisma.member.create({
        data: {
          userId: user.id,
          eventId: eventId,
          status: status,
          bookingStatus: bookingStatus,
          joinedAt: getRandomJoinDate(),
        },
      });
      
      console.log(`  ✅ ${user.name} - ${status}`);
    } catch (error) {
      console.warn(`  ⚠️  Erro ao adicionar ${user.name}:`, error.message);
    }
  }
  
  console.log(`🎯 Adicionadas ${selectedUsers.length} participantes ao evento "${event.title}"`);
}

function getRandomMemberStatus() {
  const rand = Math.random();
  
  if (rand < PARTICIPATION_STATS.committedPercentage) {
    return 'COMMITTED';
  } else if (rand < PARTICIPATION_STATS.committedPercentage + PARTICIPATION_STATS.joinedPercentage) {
    return 'JOINED';
  } else {
    return 'CANT_MAKE_IT';
  }
}

function getRandomJoinDate() {
  // Data aleatória entre 1-7 dias atrás
  const daysAgo = Math.floor(Math.random() * 7) + 1;
  const joinDate = new Date();
  joinDate.setDate(joinDate.getDate() - daysAgo);
  joinDate.setHours(Math.floor(Math.random() * 24));
  joinDate.setMinutes(Math.floor(Math.random() * 60));
  return joinDate;
}

// Executar o script
populateEventMembers()
  .catch((error) => {
    console.error('❌ Erro durante execução:', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });