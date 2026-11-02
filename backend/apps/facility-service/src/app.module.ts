import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusModule, databaseModule } from '@app/common';
import { AppController } from './app.controller';
import { Equipment } from './equipment/equipment.entity';
import { EquipmentController } from './equipment/equipment.controller';
import { EquipmentService } from './equipment/equipment.service';
import { Locker } from './lockers/locker.entity';
import { LockersController } from './lockers/lockers.controller';
import { LockersService } from './lockers/lockers.service';
import { MaintenanceTicket } from './maintenance/maintenance-ticket.entity';
import { MaintenanceController } from './maintenance/maintenance.controller';
import { MaintenanceService } from './maintenance/maintenance.service';
import { Room } from './rooms/room.entity';
import { RoomsController } from './rooms/rooms.controller';
import { RoomsService } from './rooms/rooms.service';
import { FacilityStatsService } from './stats/facility-stats.service';

@Module({
  imports: [
    databaseModule('facility'),
    TypeOrmModule.forFeature([Room, Equipment, MaintenanceTicket, Locker]),
    BusModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController, RoomsController, EquipmentController, MaintenanceController, LockersController],
  providers: [RoomsService, EquipmentService, MaintenanceService, LockersService, FacilityStatsService],
})
export class AppModule {}
