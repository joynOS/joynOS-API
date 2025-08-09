import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SignInDto, SignUpDto } from '../users/dto';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Create account' })
  @ApiResponse({ status: 201 })
  async signup(@Body() dto: SignUpDto) {
    return this.auth.signup(dto.email, dto.password, dto.name);
  }

  @Post('signin')
  @ApiOperation({ summary: 'Sign in' })
  @ApiResponse({ status: 200 })
  async signin(@Body() dto: SignInDto) {
    return this.auth.signin(dto.email, dto.password);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh tokens' })
  @ApiResponse({ status: 200 })
  async refresh(@Req() req: any) {
    const token = req.headers['x-refresh-token'] as string;
    if (!token) return { error: 'unauthorized' };
    const { verify } = await import('jsonwebtoken');
    let payload: any;
    try {
      payload = verify(token, process.env.JWT_REFRESH_SECRET || 'dev-refresh');
    } catch {
      return { error: 'unauthorized' };
    }
    if (!payload?.sub) return { error: 'unauthorized' };
    return this.auth.refresh(payload.sub, token);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout' })
  @ApiResponse({ status: 200 })
  async logout(@Req() req: any) {
    const auth = req.headers['authorization'] as string;
    if (!auth) return { ok: true };
    const token = auth.split(' ')[1];
    const payload = token
      ? ((await import('jsonwebtoken')).decode(token) as any)
      : null;
    if (!payload?.sub) return { ok: true };
    return this.auth.logout(payload.sub);
  }
}
