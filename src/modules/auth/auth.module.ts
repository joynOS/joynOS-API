import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersRepository } from '../users/users.repository';

@Module({
  imports: [JwtModule.register({})],
  providers: [AuthService, UsersRepository],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
