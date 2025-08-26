import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersRepository } from '../users/users.repository';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [JwtModule.register({}), AssetsModule],
  providers: [AuthService, UsersRepository],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
