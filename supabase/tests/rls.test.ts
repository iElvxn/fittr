import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const describeIfConfigured = supabaseUrl && supabasePublishableKey ? describe : describe.skip;

/**
 * Automated cross-user RLS check for `profiles` (per the spec: "an
 * automated test confirms one [user] cannot read the other's profiles
 * row" — replacing a one-time manual SQL-editor check for a non-negotiable
 * security baseline).
 *
 * This hits a real Supabase project (via signUp against Supabase Auth, the
 * same as production sign-up) rather than a mock, since RLS is enforced by
 * Postgres itself and can't be verified by mocking the client. It is
 * skipped — not failed — when Supabase credentials aren't present in the
 * environment, so it doesn't block `npm test` for contributors who haven't
 * configured `.env.local` yet; wire `EXPO_PUBLIC_SUPABASE_URL` /
 * `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` into CI secrets to make this test
 * actually run there.
 *
 * No manual `profiles` insert here: the `handle_new_user` trigger on
 * `auth.users` (0001_profiles.sql) creates the row automatically as part of
 * `signUp` itself.
 */
describeIfConfigured('profiles RLS: cross-user isolation', () => {
  jest.setTimeout(30000);

  it("a second user cannot SELECT the first user's profiles row", async () => {
    const client1 = createClient(supabaseUrl!, supabasePublishableKey!);
    const client2 = createClient(supabaseUrl!, supabasePublishableKey!);

    const stamp = Date.now();
    const password = 'Test-password-123!';

    const signUp1 = await client1.auth.signUp({
      email: `rls-test-1-${stamp}@example.com`,
      password,
    });
    expect(signUp1.error).toBeNull();
    const user1Id = signUp1.data.user?.id;
    expect(user1Id).toBeTruthy();

    const signUp2 = await client2.auth.signUp({
      email: `rls-test-2-${stamp}@example.com`,
      password,
    });
    expect(signUp2.error).toBeNull();

    const { data, error } = await client2
      .from('profiles')
      .select('*')
      .eq('id', user1Id)
      .maybeSingle();

    // RLS denies the row rather than erroring: an empty result, not a thrown error.
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
