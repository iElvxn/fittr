import { isNewAccount } from '@/lib/auth/isNewAccount';

describe('isNewAccount', () => {
  it('is true when last_sign_in_at is null (first-ever sign-in, some Supabase SDK versions)', () => {
    expect(isNewAccount({ created_at: '2026-01-01T00:00:00.000Z', last_sign_in_at: null })).toBe(true);
  });

  it('is true when last_sign_in_at is undefined', () => {
    expect(isNewAccount({ created_at: '2026-01-01T00:00:00.000Z' })).toBe(true);
  });

  it('is true when created_at and last_sign_in_at are close together (new account)', () => {
    expect(
      isNewAccount({
        created_at: '2026-01-01T00:00:00.000Z',
        last_sign_in_at: '2026-01-01T00:00:00.500Z',
      }),
    ).toBe(true);
  });

  it('is false when last_sign_in_at is well after created_at (returning account)', () => {
    expect(
      isNewAccount({
        created_at: '2026-01-01T00:00:00.000Z',
        last_sign_in_at: '2026-02-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });
});
