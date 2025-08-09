import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Quiz')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quiz')
export class QuizController {
  @Get('active')
  @ApiOperation({ summary: 'Get active quiz' })
  @ApiResponse({ status: 200 })
  active() {
    return { id: 'quiz-1', questions: [] };
  }

  @Post(':quizId/answers')
  @ApiOperation({ summary: 'Submit answers' })
  @ApiResponse({ status: 200 })
  submit(
    @Param('quizId') quizId: string,
    @Body() body: { answers: { questionId: string; answerKey: string }[] },
  ) {
    return { ok: true };
  }
}
