import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersController } from './modules/users/users.controller';
import { UsersService } from './modules/users/users.service';
import { UsersRepository } from './modules/users/users.repository';
import { InterestsController } from './modules/interests/interests.controller';
import { EventsModule } from './modules/events/events.module';
import { QuizController } from './modules/quiz/quiz.controller';
import { AdminController } from './modules/admin/admin.controller';
import { EventsRepository } from './modules/events/events.repository';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AIModule } from './modules/ai/ai.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { MatchingModule } from './modules/matching/matching.module';
import { ProfileModule } from './modules/profile/profile.module';
// removed global idempotency interceptor; apply per-route

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    EventsModule,
    JwtModule.register({}),
    AIModule,
    IngestionModule,
    MatchingModule,
    ProfileModule,
  ],
  controllers: [
    AppController,
    UsersController,
    InterestsController,
    QuizController,
    AdminController,
  ],
  providers: [
    AppService,
    UsersService,
    UsersRepository,
    EventsRepository,
    JwtAuthGuard,
  ],
})
export class AppModule {}
