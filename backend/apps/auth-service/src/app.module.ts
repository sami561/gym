import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusModule, databaseModule } from '@app/common';
import { User } from './users/user.entity';
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';
import { RefreshSession } from './sessions/refresh-session.entity';
import { RefreshSessionsService } from './sessions/refresh-sessions.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';

@Module({
  imports: [
    databaseModule('auth'),
    TypeOrmModule.forFeature([User, RefreshSession]),
    JwtModule.register({}),
    BusModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [UsersController, AuthController],
  providers: [UsersService, RefreshSessionsService, AuthService],
})
export class AppModule {}
