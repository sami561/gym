import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusModule, databaseModule } from '@app/common';
import { Member } from './members/member.entity';
import { Plan } from './plans/plan.entity';
import { Subscription } from './subscriptions/subscription.entity';
import { Payment } from './payments/payment.entity';
import { PromoCode } from './promos/promo.entity';
import { Lead, LeadActivity } from './leads/lead.entity';
import { MembersService } from './members/members.service';
import { MembersController } from './members/members.controller';
import { PlansService } from './plans/plans.service';
import { PlansController } from './plans/plans.controller';
import { SubscriptionsService } from './subscriptions/subscriptions.service';
import { SubscriptionsController } from './subscriptions/subscriptions.controller';
import { SubscriptionsScheduler } from './subscriptions/subscriptions.scheduler';
import { PaymentsService } from './payments/payments.service';
import { PaymentsController } from './payments/payments.controller';
import { PromosService } from './promos/promos.service';
import { PromosController } from './promos/promos.controller';
import { LeadsService } from './leads/leads.service';
import { LeadsController } from './leads/leads.controller';
import { StatsService } from './stats/stats.service';
import { StatsController } from './stats/stats.controller';

@Module({
  imports: [
    databaseModule('membership'),
    TypeOrmModule.forFeature([Member, Plan, Subscription, Payment, PromoCode, Lead, LeadActivity]),
    BusModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    MembersController,
    PlansController,
    SubscriptionsController,
    PaymentsController,
    PromosController,
    LeadsController,
    StatsController,
  ],
  providers: [
    MembersService,
    PlansService,
    SubscriptionsService,
    SubscriptionsScheduler,
    PaymentsService,
    PromosService,
    LeadsService,
    StatsService,
  ],
})
export class AppModule {}
