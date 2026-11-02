import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusModule, databaseModule } from '@app/common';
import { AppController } from './app.controller';
import { EventsController } from './events/events.controller';
import { WebhookDelivery } from './webhooks/webhook-delivery.entity';
import { WebhooksService } from './webhooks/webhooks.service';
import { PushToken } from './push/push-token.entity';
import { PushController } from './push/push.controller';
import { PushService } from './push/push.service';
import { AutomationController } from './automation/automation.controller';
import { AutomationService } from './automation/automation.service';

@Module({
  imports: [
    databaseModule('notification'),
    TypeOrmModule.forFeature([WebhookDelivery, PushToken]),
    BusModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController, EventsController, PushController, AutomationController],
  providers: [WebhooksService, PushService, AutomationService],
})
export class AppModule {}
