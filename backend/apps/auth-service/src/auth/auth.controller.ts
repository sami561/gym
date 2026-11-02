import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  ChangePasswordRequest,
  LoginRequest,
  LogoutRequest,
  PATTERNS,
  RefreshRequest,
  healthResult,
} from '@app/common';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @MessagePattern(PATTERNS.auth.login)
  login(@Payload() req: LoginRequest) {
    return this.auth.login(req);
  }

  @MessagePattern(PATTERNS.auth.refresh)
  refresh(@Payload() req: RefreshRequest) {
    return this.auth.refresh(req);
  }

  @MessagePattern(PATTERNS.auth.logout)
  logout(@Payload() req: LogoutRequest) {
    return this.auth.logout(req);
  }

  @MessagePattern(PATTERNS.auth.changePassword)
  changePassword(@Payload() req: ChangePasswordRequest) {
    return this.auth.changePassword(req);
  }

  @MessagePattern(PATTERNS.auth.health)
  health() {
    return healthResult('auth-service');
  }
}
