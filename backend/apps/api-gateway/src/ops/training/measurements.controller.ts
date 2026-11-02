import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, MeasurementDto, PATTERNS, Role, Roles, RpcClient } from '@app/common';
import { CreateMeasurementDto } from './training.dto';

/** Body measurements of a member, recorded by staff or coaches (members use /api/me/measurements). */
@ApiTags('Entraînement — mensurations')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.COACH)
@Controller()
export class MeasurementsController {
  constructor(private readonly rpc: RpcClient) {}

  @Get('members/:id/measurements')
  list(@Param('id', ParseUUIDPipe) memberId: string) {
    return this.rpc.send<MeasurementDto[]>(PATTERNS.measurements.list, { memberId });
  }

  @Post('members/:id/measurements')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) memberId: string,
    @Body() dto: CreateMeasurementDto,
  ) {
    return this.rpc.send<MeasurementDto>(PATTERNS.measurements.create, {
      ...dto,
      memberId,
      recordedByName: user.name,
    });
  }

  @Delete('measurements/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.measurements.remove, { id });
  }
}
