import { ArgumentMetadata, BadRequestException, Type } from '@nestjs/common';
import { getMetadataStorage } from 'class-validator';
import { LeadSource, PaymentMethod } from '@app/common';
import * as accessDto from '../access/access.dto';
import * as authDto from '../auth/auth.dto';
import * as classesDto from '../classes/classes.dto';
import * as dashboardDto from '../dashboard/dashboard.dto';
import * as leadsDto from '../leads/leads.dto';
import * as meDto from '../me/me.dto';
import * as membersDto from '../members/members.dto';
import * as commerceDto from '../ops/commerce/commerce.dto';
import * as facilityDto from '../ops/facility/facility.dto';
import * as staffDto from '../ops/staff/staff.dto';
import * as trainingDto from '../ops/training/training.dto';
import * as workflowsDto from '../ops/workflows/workflows.dto';
import * as plansDto from '../plans/plans.dto';
import * as publicDto from '../public/public.dto';
import * as usersDto from '../users/users.dto';
import { createValidationPipe } from './validation';

const { CreatePlanDto, ListPlansQuery, UpdatePlanDto } = plansDto;
const { CreateSaleDto, SaleItemInputDto } = commerceDto;
const PRODUCT_ID = '0b9a2c6e-6f1d-4c39-9a51-3d2f8e7c1a01';

const pipe = createValidationPipe();
const run = (type: ArgumentMetadata['type'], metatype: Type<unknown>, value: unknown): Promise<unknown> =>
  pipe.transform(value, { type, metatype });

/** Validation messages of a refused value, [] when it passes. */
async function refusals(type: ArgumentMetadata['type'], metatype: Type<unknown>, value: unknown): Promise<string[]> {
  try {
    await run(type, metatype, value);
    return [];
  } catch (err) {
    if (!(err instanceof BadRequestException)) throw err;
    return (err.getResponse() as { message: string[] }).message;
  }
}

/** Every exported *Query class of the gateway DTOs, with its fields of the given declared type. */
const QUERY_DTOS = [
  accessDto,
  authDto,
  classesDto,
  dashboardDto,
  leadsDto,
  meDto,
  membersDto,
  commerceDto,
  facilityDto,
  staffDto,
  trainingDto,
  workflowsDto,
  plansDto,
  publicDto,
  usersDto,
]
  .flatMap((module) => Object.values(module) as unknown[])
  .filter((value): value is Type<unknown> => typeof value === 'function' && value.name.endsWith('Query'));

function queryFields(declared: NumberConstructor | BooleanConstructor): [string, Type<unknown>, string][] {
  return QUERY_DTOS.flatMap((dto) => {
    const fields = getMetadataStorage()
      .getTargetValidationMetadatas(dto, '', true, false)
      .map((metadata) => metadata.propertyName);
    return [...new Set(fields)]
      .filter((field) => Reflect.getMetadata('design:type', dto.prototype as object, field) === declared)
      .map((field): [string, Type<unknown>, string] => [`${dto.name}.${field}`, dto, field]);
  });
}

describe('global validation pipe (main.ts)', () => {
  describe('JSON bodies keep their own types', () => {
    it('refuses an object, a number, a boolean or a list sent for a text field', async () => {
      const lead = { firstName: 'Amira', lastName: 'Jaziri', source: LeadSource.WALK_IN };
      for (const notes of [{ a: 1 }, 42, true, ['texte']]) {
        expect(await refusals('body', membersDto.UpdateMemberDto, { notes })).toContain('notes must be a string');
        expect(await refusals('body', leadsDto.CreateLeadDto, { ...lead, notes })).toContain('notes must be a string');
      }
      expect(await refusals('body', leadsDto.CreateLeadDto, { ...lead, notes: 'Rappeler lundi' })).toEqual([]);
    });

    it('refuses text sent for a number or a boolean instead of converting it', async () => {
      const messages = await refusals('body', UpdatePlanDto, { isActive: 'false', price: '90', durationDays: true });
      expect(messages).toEqual(
        expect.arrayContaining([
          'isActive must be a boolean value',
          'price must be a number conforming to the specified constraints',
          'durationDays must be an integer number',
        ]),
      );
      expect(await refusals('body', UpdatePlanDto, { price: '' })).toContain(
        'price must be a number conforming to the specified constraints',
      );
    });

    it('accepts the declared types and drops unknown fields', async () => {
      const plan = await run('body', CreatePlanDto, {
        name: 'Mensuel',
        durationDays: 30,
        price: 90,
        isActive: false,
        features: ['Accès illimité'],
        actor: { id: 'x', role: 'ADMIN' },
      });
      expect(plan).toBeInstanceOf(CreatePlanDto);
      expect(plan).toEqual({ name: 'Mensuel', durationDays: 30, price: 90, isActive: false, features: ['Accès illimité'] });
      expect(await run('body', membersDto.CardDto, { cardNumber: null })).toEqual({ cardNumber: null });
    });

    it('still builds and checks nested DTOs', async () => {
      const sale = (await run('body', CreateSaleDto, {
        items: [{ productId: PRODUCT_ID, quantity: 2 }],
        paymentMethod: PaymentMethod.CASH,
      })) as commerceDto.CreateSaleDto;
      expect(sale.items[0]).toBeInstanceOf(SaleItemInputDto);
      expect(sale.items[0].quantity).toBe(2);
      expect(
        await refusals('body', CreateSaleDto, {
          items: [{ productId: PRODUCT_ID, quantity: '2' }],
          paymentMethod: PaymentMethod.CASH,
        }),
      ).toContain('items.0.quantity must be an integer number');
    });
  });

  describe('query strings are text', () => {
    const numeric = queryFields(Number);
    const booleans = queryFields(Boolean);

    it('finds the numeric and boolean query parameters', () => {
      expect(numeric.map(([name]) => name)).toEqual(
        expect.arrayContaining([
          'ListLogsQuery.limit',
          'MonthsQuery.months',
          'DaysQuery.days',
          'LimitQuery.limit',
          'ListMembersQuery.page',
          'ListMembersQuery.pageSize',
          'ListPaymentsQuery.page',
          'ListPaymentsQuery.pageSize',
          'ListStockMovementsQuery.limit',
          'ListSalesQuery.page',
          'ListSalesQuery.pageSize',
          'FinanceQuery.months',
          'ListEquipmentQuery.dueWithinDays',
          'ListRunsQuery.limit',
        ]),
      );
      expect(booleans.map(([name]) => name)).toEqual(
        expect.arrayContaining(['ListPlansQuery.includeInactive', 'BookingsQuery.includePast', 'ListTasksQuery.mine']),
      );
    });

    it.each(numeric)('%s reads "7" as the number 7', async (_name, dto, field) => {
      expect(await run('query', dto, { [field]: '7' })).toEqual({ [field]: 7 });
    });

    it.each(booleans)('%s reads "true", "1" and "yes" as true, anything else as false', async (_name, dto, field) => {
      for (const text of ['true', '1', 'yes']) expect(await run('query', dto, { [field]: text })).toEqual({ [field]: true });
      for (const text of ['false', '0', '']) expect(await run('query', dto, { [field]: text })).toEqual({ [field]: false });
    });

    it('refuses numbers that are not numbers or out of range', async () => {
      expect(await refusals('query', dashboardDto.DaysQuery, { days: 'abc' })).toContain('days must be an integer number');
      expect(await refusals('query', dashboardDto.DaysQuery, { days: '0' })).toContain('days must not be less than 1');
      expect(await refusals('query', membersDto.ListMembersQuery, { pageSize: '500' })).toContain(
        'pageSize must not be greater than 100',
      );
    });

    it('keeps dates and other text as sent, and drops unknown parameters', async () => {
      expect(await run('query', dashboardDto.PeriodQuery, { from: '2026-10-01', to: '2026-10-31' })).toEqual({
        from: '2026-10-01',
        to: '2026-10-31',
      });
      expect(await refusals('query', dashboardDto.PeriodQuery, { from: 'hier' })).toContain(
        'from must be a valid ISO 8601 date string',
      );
      expect(await run('query', membersDto.ListMembersQuery, { search: 'Amira', status: 'active', page: '2', admin: 'true' })).toEqual({
        search: 'Amira',
        status: 'active',
        page: 2,
      });
      expect(await run('query', ListPlansQuery, {})).toEqual({});
    });
  });
});
