import { validateDisplayName } from '@/lib/profile/validation';

describe('validateDisplayName', () => {
  it('rejects an empty string', () => {
    expect(validateDisplayName('')).toEqual({ message: expect.any(String) });
  });

  it('rejects a whitespace-only string', () => {
    expect(validateDisplayName('   ')).toEqual({ message: expect.any(String) });
  });

  it('rejects a name over the length cap', () => {
    expect(validateDisplayName('a'.repeat(51))).toEqual({ message: expect.any(String) });
  });

  it('accepts a name at exactly the length cap', () => {
    expect(validateDisplayName('a'.repeat(50))).toBeNull();
  });

  it('accepts a normal name', () => {
    expect(validateDisplayName('Jane Doe')).toBeNull();
  });

  it('accepts a name with leading/trailing whitespace', () => {
    expect(validateDisplayName('  Jane Doe  ')).toBeNull();
  });
});
