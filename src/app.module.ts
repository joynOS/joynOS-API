import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
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
import { AssetsModule } from './modules/assets/assets.module';
import { SeedModule } from './seed/seed.module';
import { AppVersionCheckModule } from './modules/app/app.module';
// removed global idempotency interceptor; apply per-route

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    EventsModule,
    JwtModule.register({}),
    AIModule,
    IngestionModule,
    MatchingModule,
    ProfileModule,
    AssetsModule,
    SeedModule,
    AppVersionCheckModule,
  ],
  controllers: [
    AppController,
    InterestsController,
    QuizController,
    AdminController,
  ],
  providers: [AppService, EventsRepository, JwtAuthGuard],
})
export class AppModule {}
