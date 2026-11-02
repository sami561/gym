import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  BookingDto,
  BookingPolicy,
  ClassSessionDto,
  PATTERNS,
  Public,
  Role,
  Roles,
  RpcClient,
} from '@app/common';
import { ClassRangeQuery } from '../public/public.dto';
import { BookingStatusDto, CreateClassDto, UpdateClassDto } from './classes.dto';

@ApiTags('Planning des cours')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF, Role.COACH)
@Controller()
export class ClassesController {
  constructor(private readonly rpc: RpcClient) {}

  @Get('classes')
  list(@Query() q: ClassRangeQuery) {
    return this.rpc.send<ClassSessionDto[]>(PATTERNS.classes.list, q);
  }

  @Post('classes')
  create(@Body() dto: CreateClassDto) {
    return this.rpc.send<ClassSessionDto[]>(PATTERNS.classes.create, dto);
  }

  @Patch('classes/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassDto) {
    return this.rpc.send<ClassSessionDto>(PATTERNS.classes.update, { id, data: dto });
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Delete('classes/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<{ ok: true }>(PATTERNS.classes.remove, { id });
  }

  @Get('classes/:id/bookings')
  bookings(@Param('id', ParseUUIDPipe) id: string) {
    return this.rpc.send<BookingDto[]>(PATTERNS.classes.bookings, { id });
  }

  /** Reservation rules (booking window, cancellation deadline, no-show policy). */
  @Public()
  @Get('bookings/policy')
  policy() {
    return this.rpc.send<BookingPolicy>(PATTERNS.bookings.policy, {});
  }

  @Patch('bookings/:id')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BookingStatusDto) {
    return this.rpc.send<BookingDto>(PATTERNS.bookings.setStatus, { bookingId: id, status: dto.status });
  }
}
