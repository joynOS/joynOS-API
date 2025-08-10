import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { AIService } from '../ai/ai.service';

@ApiTags('Quiz')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quiz')
export class QuizController {
  constructor(private readonly prisma: PrismaService, private readonly ai: AIService) {}
  @Get('active')
  @ApiOperation({ summary: 'Get active quiz' })
  @ApiResponse({ status: 200 })
  async active() { const quiz = await this.prisma.quiz.findFirst({ where: { isActive: true }, include: { questions: { include: { answers: true }, orderBy: { order: 'asc' } } } }); return quiz || { id: null, questions: [] } }

  @Post(':quizId/answers')
  @ApiOperation({ summary: 'Submit answers' })
  @ApiResponse({ status: 200 })
  async submit(
    @Param('quizId') quizId: string,
    @Body() body: { answers: { questionId: string; answerKey: string }[] },
    @Req() req: any,
  ) {
    const userId = req.user.userId as string
    const questions = await this.prisma.quizQuestion.findMany({ where: { quizId }, include: { answers: true } })
    const tally: Record<string, number> = {}
    for (const a of body.answers) {
      const q = questions.find(q => q.id === a.questionId)
      const ans = q?.answers.find(x => x.key === a.answerKey)
      if (ans?.archetype) tally[ans.archetype] = (tally[ans.archetype] || 0) + 1
    }
    const dominantArchetype = Object.entries(tally).sort((a,b)=> b[1]-a[1])[0]?.[0] || null
    await this.prisma.userQuizResult.upsert({ where: { userId_quizId: { userId, quizId } }, update: { archetypeTally: tally as any, dominantArchetype: dominantArchetype || undefined }, create: { userId, quizId, archetypeTally: tally as any, dominantArchetype: dominantArchetype || undefined } })
    const userInterests = await this.prisma.userInterest.findMany({ where: { userId }, include: { interest: true } })
    const profileText = `Archetype tally: ${JSON.stringify(tally)}; interests: ${userInterests.map(ui=>ui.interest.slug).join(', ')}`
    const vector = await this.ai.embed(profileText)
    await this.prisma.user.update({ where: { id: userId }, data: { aiProfile: { tally, dominantArchetype } as any, embedding: Buffer.from(Float32Array.from(vector).buffer) } })
    return { ok: true }
  }
}
