import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DoorDriver } from '@app/common';
import { CreateDoorDto, UpdateDoorDto } from './access.dto';

async function failed(type: typeof CreateDoorDto | typeof UpdateDoorDto, body: object): Promise<string[]> {
  const found = await validate(plainToInstance(type, body), { whitelist: true });
  return found.map((error) => error.property);
}

describe('door DTOs (POST /api/doors, PATCH /api/doors/:id)', () => {
  const door = { name: 'Entrée', driver: DoorDriver.HTTP_RELAY, config: { url: 'http://192.168.1.50/open' } };

  it('accepts allowAppOpen as a boolean, or without it', async () => {
    expect(await failed(CreateDoorDto, door)).toEqual([]);
    expect(await failed(CreateDoorDto, { ...door, allowAppOpen: false })).toEqual([]);
    expect(await failed(UpdateDoorDto, { allowAppOpen: true })).toEqual([]);
  });

  it('refuses anything else', async () => {
    expect(await failed(CreateDoorDto, { ...door, allowAppOpen: 'no' })).toEqual(['allowAppOpen']);
    expect(await failed(UpdateDoorDto, { allowAppOpen: 1 })).toEqual(['allowAppOpen']);
  });
});
