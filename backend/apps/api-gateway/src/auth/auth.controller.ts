import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AuthResult,
  AuthUser,
  CreateMemberResult,
  CurrentUser,
  PATTERNS,
  Public,
  RpcClient,
  UserDto,
} from '@app/common';
import { ChangePasswordDto, LoginDto, RefreshDto, RegisterDto } from './auth.dto';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly rpc: RpcClient) {}

  /** Self-registration of a member (mobile app / website); returns a session right away. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AuthResult> {
    await this.rpc.send<CreateMemberResult>(PATTERNS.members.create, dto);
    return this.rpc.send<AuthResult>(PATTERNS.auth.login, { email: dto.email, password: dto.password });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.rpc.send<AuthResult>(PATTERNS.auth.login, dto);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.rpc.send<AuthResult>(PATTERNS.auth.refresh, dto);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('logout')
  logout(@CurrentUser() user: AuthUser) {
    return this.rpc.send<{ ok: true }>(PATTERNS.auth.logout, { userId: user.id });
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.rpc.send<UserDto>(PATTERNS.users.get, { id: user.id });
  }

  @ApiBearerAuth()
  @Patch('password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.rpc.send<{ ok: true }>(PATTERNS.auth.changePassword, { userId: user.id, ...dto });
  }
}
