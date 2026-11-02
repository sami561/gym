import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateMeasurementRequest,
  IdRequest,
  ListMeasurementsRequest,
  MeasurementDto,
  OkResult,
  toDateOnly,
} from '@app/common';
import { Measurement } from './measurement.entity';
import { computeBmi, latestKnownHeight, withBmi } from './bmi';
import { toMeasurementDto } from '../mappers';
import { PeopleService } from '../shared/people.service';
import { assertDateOnly, optionalMetric, optionalText, requireText } from '../shared/validation';

type MetricKey = 'weightKg' | 'heightCm' | 'bodyFatPct' | 'musclePct' | 'chestCm' | 'waistCm' | 'hipsCm' | 'armCm' | 'thighCm';

const METRICS: { key: MetricKey; label: string; min: number; max: number }[] = [
  { key: 'weightKg', label: 'Le poids (kg)', min: 20, max: 400 },
  { key: 'heightCm', label: 'La taille (cm)', min: 80, max: 250 },
  { key: 'bodyFatPct', label: 'La masse grasse (%)', min: 1, max: 80 },
  { key: 'musclePct', label: 'La masse musculaire (%)', min: 1, max: 90 },
  { key: 'chestCm', label: 'Le tour de poitrine (cm)', min: 30, max: 250 },
  { key: 'waistCm', label: 'Le tour de taille (cm)', min: 30, max: 250 },
  { key: 'hipsCm', label: 'Le tour de hanches (cm)', min: 30, max: 250 },
  { key: 'armCm', label: 'Le tour de bras (cm)', min: 10, max: 100 },
  { key: 'thighCm', label: 'Le tour de cuisse (cm)', min: 20, max: 150 },
];

@Injectable()
export class MeasurementsService {
  constructor(
    @InjectRepository(Measurement) private readonly measurements: Repository<Measurement>,
    private readonly people: PeopleService,
  ) {}

  /** Oldest first, ready for progress charts. */
  async list({ memberId }: ListMeasurementsRequest): Promise<MeasurementDto[]> {
    const rows = await this.history(requireText(memberId, 'Le membre est obligatoire.'));
    return withBmi(rows).map((row) => toMeasurementDto(row, row.bmi));
  }

  async create(request: CreateMeasurementRequest): Promise<MeasurementDto> {
    const memberId = requireText(request.memberId, 'Le membre est obligatoire.');
    const metrics = {} as Record<MetricKey, number | null>;
    for (const { key, label, min, max } of METRICS) metrics[key] = optionalMetric(request[key], label, min, max);
    if (Object.values(metrics).every((value) => value === null)) {
      throw new BadRequestException('Renseignez au moins une mesure.');
    }
    const date = request.date ? assertDateOnly(request.date, 'La date') : toDateOnly();
    if (date > toDateOnly()) throw new BadRequestException('La date de mesure ne peut pas être dans le futur.');

    await this.people.memberName(memberId); // rejects unknown members
    const saved = await this.measurements.save(
      this.measurements.create({
        memberId,
        date,
        ...metrics,
        notes: optionalText(request.notes),
        recordedByName: optionalText(request.recordedByName),
      }),
    );
    const height = saved.heightCm ?? latestKnownHeight(await this.history(memberId));
    return toMeasurementDto(saved, computeBmi(saved.weightKg, height));
  }

  async remove({ id }: IdRequest): Promise<OkResult> {
    const result = await this.measurements.delete({ id });
    if (!result.affected) throw new NotFoundException('Mesure introuvable.');
    return { ok: true };
  }

  private history(memberId: string): Promise<Measurement[]> {
    return this.measurements.find({ where: { memberId }, order: { date: 'ASC', createdAt: 'ASC' } });
  }
}
