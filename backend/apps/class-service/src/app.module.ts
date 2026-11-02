import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusModule, databaseModule } from '@app/common';
import { AppController } from './app.controller';
import { ClassSession } from './classes/class-session.entity';
import { ClassesController } from './classes/classes.controller';
import { ClassesService } from './classes/classes.service';
import { OccupancyService } from './classes/occupancy.service';
import { Booking } from './bookings/booking.entity';
import { AttendanceService } from './bookings/attendance.service';
import { BookingsController } from './bookings/bookings.controller';
import { BookingsService } from './bookings/bookings.service';

@Module({
  imports: [
    databaseModule('class'),
    TypeOrmModule.forFeature([ClassSession, Booking]),
    BusModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController, ClassesController, BookingsController],
  providers: [ClassesService, OccupancyService, BookingsService, AttendanceService],
})
export class AppModule {}
