import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const describeIfConfigured =
  supabaseUrl && supabasePublishableKey && supabaseServiceRoleKey ? describe : describe.skip;

/**
 * Automated cross-user RLS check for `profiles` (per the spec: "an
 * automated test confirms one [user] cannot read the other's profiles
 * row" — replacing a one-time manual SQL-editor check for a non-negotiable
 * security baseline).
 *
 * This hits a real Supabase project rather than a mock, since RLS is
 * enforced by Postgres itself and can't be verified by mocking the client.
 * It is skipped — not failed — when Supabase credentials aren't present in
 * the environment, so it doesn't block `npm test` for contributors who
 * haven't configured `.env.local` yet.
 *
 * Test users are created via the Admin API (`email_confirm: true`), not the
 * public `signUp()` flow: "Confirm email" is intentionally kept ON for real
 * users (anti-bot-signup protection), but that means every `signUp()` call
 * sends a real confirmation email through Supabase's rate-limited default
 * email service — two signups per test run quickly exhausts that quota. The
 * Admin API creates a pre-confirmed user directly, with no email sent and
 * no rate-limit interaction, using the `service_role` key (bypasses RLS —
 * used ONLY here to set up fixtures, never for the actual RLS assertion
 * below, which goes through a normal signed-in client exactly like the app
 * does).
 *
 * No manual `profiles` insert here: the `handle_new_user` trigger on
 * `auth.users` (0001_profiles.sql) creates the row automatically as part of
 * user creation itself.
 */
describeIfConfigured('profiles RLS: cross-user isolation', () => {
  jest.setTimeout(30000);

  it("a second user cannot SELECT the first user's profiles row", async () => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);

    const stamp = Date.now();
    const password = 'Test-password-123!';
    const email1 = `rls-test-1-${stamp}@mailinator.com`;
    const email2 = `rls-test-2-${stamp}@mailinator.com`;

    const created1 = await admin.auth.admin.createUser({
      email: email1,
      password,
      email_confirm: true,
    });
    expect(created1.error).toBeNull();
    const user1Id = created1.data.user?.id;
    expect(user1Id).toBeTruthy();

    const created2 = await admin.auth.admin.createUser({
      email: email2,
      password,
      email_confirm: true,
    });
    expect(created2.error).toBeNull();
    const user2Id = created2.data.user?.id;
    expect(user2Id).toBeTruthy();

    try {
      // The actual RLS check goes through a normal signed-in client -- the
      // same kind of client and session the app itself uses -- not the
      // admin client, which bypasses RLS entirely and would prove nothing.
      const client2 = createClient(supabaseUrl!, supabasePublishableKey!);
      const signIn2 = await client2.auth.signInWithPassword({ email: email2, password });
      expect(signIn2.error).toBeNull();

      const { data, error } = await client2
        .from('profiles')
        .select('*')
        .eq('id', user1Id)
        .maybeSingle();

      // RLS denies the row rather than erroring: an empty result, not a thrown error.
      expect(error).toBeNull();
      expect(data).toBeNull();
    } finally {
      // Don't let throwaway RLS-check accounts accumulate in a real project.
      if (user1Id) await admin.auth.admin.deleteUser(user1Id);
      if (user2Id) await admin.auth.admin.deleteUser(user2Id);
    }
  });
});
