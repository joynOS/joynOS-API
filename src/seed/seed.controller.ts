import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SeedService } from './seed.service';

@ApiTags('seed')
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('all')
  @ApiOperation({ summary: 'Run complete database seed' })
  @ApiResponse({ status: 201, description: 'Database seeded successfully' })
  async seedAll() {
    await this.seedService.seedAll();
    return { message: 'Database seeded successfully' };
  }

  @Post('quiz')
  @ApiOperation({ summary: 'Seed quiz questions only' })
  @ApiResponse({ status: 201, description: 'Quiz seeded successfully' })
  async seedQuiz() {
    await this.seedService.seedQuiz();
    return { message: 'Quiz seeded successfully' };
  }
}
