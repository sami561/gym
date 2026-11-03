import { gymInfo } from './gym.config';

// Never read the developer's backend/.env in a unit test.
jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('gymInfo social links', () => {
  const clear = () => {
    delete process.env.GYM_INSTAGRAM;
    delete process.env.GYM_FACEBOOK;
  };
  beforeEach(clear);
  afterEach(clear);

  it("defaults to the gym's Instagram and Facebook pages", () => {
    const gym = gymInfo();
    expect(gym.instagram).toBe('https://www.instagram.com/gymmeliora/');
    expect(gym.facebook).toBe('https://www.facebook.com/p/Meliora-Gym-61589769249533/');
  });

  it('reads GYM_FACEBOOK, and keeps the default when it is empty', () => {
    process.env.GYM_FACEBOOK = 'https://www.facebook.com/example-gym/';
    expect(gymInfo().facebook).toBe('https://www.facebook.com/example-gym/');
    process.env.GYM_FACEBOOK = '';
    expect(gymInfo().facebook).toBe('https://www.facebook.com/p/Meliora-Gym-61589769249533/');
  });
});
