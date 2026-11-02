import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateMeasurementRequest,
  IdRequest,
  ListMeasurementsRequest,
  MeasurementDto,
  OkResult,
  PATTERNS,
} from '@app/common';
import { MeasurementsService } from './measurements.service';

@Controller()
export class MeasurementsController {
  constructor(private readonly measurements: MeasurementsService) {}

  @MessagePattern(PATTERNS.measurements.list)
  list(@Payload() request: ListMeasurementsRequest): Promise<MeasurementDto[]> {
    return this.measurements.list(request);
  }

  @MessagePattern(PATTERNS.measurements.create)
  create(@Payload() request: CreateMeasurementRequest): Promise<MeasurementDto> {
    return this.measurements.create(request);
  }

  @MessagePattern(PATTERNS.measurements.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.measurements.remove(request);
  }
}
