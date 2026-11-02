import { BadRequestException } from '@nestjs/common';
import { MAX_LOCKERS_PER_BATCH, compareLockerNumbers, lockerNumbers } from './locker-numbers';

describe('lockerNumbers', () => {
  it('numbers lockers with the prefix', () => {
    expect(lockerNumbers('H-', 1, 3)).toEqual(['H-1', 'H-2', 'H-3']);
    expect(lockerNumbers(undefined, 9, 10)).toEqual(['9', '10']);
    expect(lockerNumbers('  F', 40, 40)).toEqual(['F40']);
  });

  it('rejects invalid ranges and oversized batches', () => {
    expect(() => lockerNumbers('H-', 0, 3)).toThrow(BadRequestException);
    expect(() => lockerNumbers('H-', 5, 4)).toThrow(BadRequestException);
    expect(() => lockerNumbers('H-', 1.5, 4)).toThrow(BadRequestException);
    expect(() => lockerNumbers('H-', 1, MAX_LOCKERS_PER_BATCH + 1)).toThrow(BadRequestException);
    expect(() => lockerNumbers('VERY-LONG-PREFIX', 1, 2)).toThrow(BadRequestException);
  });

  it('sorts numbers naturally', () => {
    expect(['H-10', 'H-2', 'F-1', 'H-1'].sort(compareLockerNumbers)).toEqual(['F-1', 'H-1', 'H-2', 'H-10']);
  });
});
