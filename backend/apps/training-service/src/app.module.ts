import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusModule, databaseModule } from '@app/common';
import { AppController } from './app.controller';
import { PeopleService } from './shared/people.service';
import { Exercise } from './exercises/exercise.entity';
import { ExercisesController } from './exercises/exercises.controller';
import { ExercisesService } from './exercises/exercises.service';
import { WorkoutProgram } from './programs/workout-program.entity';
import { ProgramsController } from './programs/programs.controller';
import { ProgramsService } from './programs/programs.service';
import { Measurement } from './measurements/measurement.entity';
import { MeasurementsController } from './measurements/measurements.controller';
import { MeasurementsService } from './measurements/measurements.service';
import { PtSession } from './pt-sessions/pt-session.entity';
import { PtSessionsController } from './pt-sessions/pt-sessions.controller';
import { PtSessionsService } from './pt-sessions/pt-sessions.service';
import { StatsService } from './stats/stats.service';
import { SyncController } from './sync/sync.controller';

@Module({
  imports: [
    databaseModule('training'),
    TypeOrmModule.forFeature([Exercise, WorkoutProgram, Measurement, PtSession]),
    BusModule.forRoot(),
  ],
  controllers: [
    AppController,
    ExercisesController,
    ProgramsController,
    MeasurementsController,
    PtSessionsController,
    SyncController,
  ],
  providers: [PeopleService, ExercisesService, ProgramsService, MeasurementsService, PtSessionsService, StatsService],
})
export class AppModule {}
