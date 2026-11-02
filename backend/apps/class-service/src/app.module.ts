import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusModule, databaseModule } from '@app/common';
import { AppController } from './app.controller';
import { ClassSession } from './classes/class-session.entity';
import { ClassesController } from './classes/classes.controller';
import { ClassesService } from './classes/classes.service';
import { Booking } from './bookings/booking.entity';
import { BookingsController } from './bookings/bookings.controller';
import { BookingsService } from './bookings/bookings.service';

@Module({
  imports: [databaseModule('class'), TypeOrmModule.forFeature([ClassSession, Booking]), BusModule.forRoot()],
  controllers: [AppController, ClassesController, BookingsController],
  providers: [ClassesService, BookingsService],
})
export class AppModule {}
