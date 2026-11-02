import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard, BusModule } from '@app/common';
import { LiveGateway } from './live/live.gateway';
import { LiveEventsController } from './live/live-events.controller';
import { HealthController } from './health/health.controller';
import { PublicController } from './public/public.controller';
import { AuthController } from './auth/auth.controller';
import { MeController } from './me/me.controller';
import { MembersController } from './members/members.controller';
import { SubscriptionsController } from './members/subscriptions.controller';
import { PaymentsController } from './members/payments.controller';
import { PlansController } from './plans/plans.controller';
import { PromosController } from './plans/promos.controller';
import { LeadsController } from './leads/leads.controller';
import { ClassesController } from './classes/classes.controller';
import { UsersController } from './users/users.controller';
import { AccessController } from './access/access.controller';
import { DoorsController } from './access/doors.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { AutomationController } from './automation/automation.controller';
import { OpsModule } from './ops/ops.module';

@Module({
  imports: [
    JwtModule.register({}),
    BusModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    OpsModule,
  ],
  controllers: [
    LiveEventsController,
    HealthController,
    PublicController,
    AuthController,
    MeController,
    MembersController,
    SubscriptionsController,
    PaymentsController,
    PlansController,
    PromosController,
    LeadsController,
    ClassesController,
    UsersController,
    AccessController,
    DoorsController,
    DashboardController,
    AutomationController,
  ],
  providers: [
    LiveGateway,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
