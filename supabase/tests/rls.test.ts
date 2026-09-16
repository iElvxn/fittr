import { createClient } from '@supabase/supabase-js';

/**
 * `crypto.randomUUID()` would need Node's types, but this project's
 * tsconfig deliberately scopes `types` to `jest` only -- keeping Node
 * globals out of the RN app code's type surface -- so this test generates
 * a throwaway row id itself instead of widening that for one test file.
 * Doesn't need cryptographic randomness, just to be UUID-shaped and unique
 * per run.
 */
function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

/**
 * Story 1.3: cross-user isolation for the `wardrobe` Storage bucket's
 * per-operation RLS (0002_avatar_storage.sql), mirroring the `profiles`
 * check above -- same rationale for hitting a real project, the Admin API
 * fixture pattern, and being skippable without credentials.
 */
describeIfConfigured('wardrobe storage RLS: cross-user isolation', () => {
  jest.setTimeout(30000);

  it("a second user cannot read or overwrite the first user's avatar object", async () => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);

    const stamp = Date.now();
    const password = 'Test-password-123!';
    const email1 = `rls-storage-1-${stamp}@mailinator.com`;
    const email2 = `rls-storage-2-${stamp}@mailinator.com`;

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

    const objectPath = `${user1Id}/avatar.jpg`;

    try {
      // User 1 uploads their own avatar, exactly as the app does.
      const client1 = createClient(supabaseUrl!, supabasePublishableKey!);
      const signIn1 = await client1.auth.signInWithPassword({ email: email1, password });
      expect(signIn1.error).toBeNull();

      const uploadResult = await client1.storage
        .from('wardrobe')
        .upload(objectPath, new Uint8Array([1, 2, 3, 4]), { contentType: 'image/jpeg', upsert: true });
      expect(uploadResult.error).toBeNull();

      // User 2 -- a normal signed-in client, not the admin client -- tries
      // to read and overwrite user 1's object.
      const client2 = createClient(supabaseUrl!, supabasePublishableKey!);
      const signIn2 = await client2.auth.signInWithPassword({ email: email2, password });
      expect(signIn2.error).toBeNull();

      const signedUrlResult = await client2.storage.from('wardrobe').createSignedUrl(objectPath, 60);
      expect(signedUrlResult.error).not.toBeNull();

      const overwriteResult = await client2.storage
        .from('wardrobe')
        .upload(objectPath, new Uint8Array([9, 9, 9, 9]), { contentType: 'image/jpeg', upsert: true });
      expect(overwriteResult.error).not.toBeNull();
    } finally {
      // Don't let throwaway RLS-check accounts/objects accumulate in a real project.
      await admin.storage.from('wardrobe').remove([objectPath]);
      if (user1Id) await admin.auth.admin.deleteUser(user1Id);
      if (user2Id) await admin.auth.admin.deleteUser(user2Id);
    }
  });
});

/**
 * Story 2.1: cross-user isolation for `wardrobe_items` (0003_wardrobe_items.sql),
 * mirroring the `profiles` SELECT-isolation check above -- same rationale
 * (RLS is enforced by Postgres, so a mock proves nothing) and the same
 * Admin API fixture pattern. This is the acceptance criterion verbatim:
 * "a second signed-in user queries wardrobe_items, RLS returns zero rows
 * for the first user's item" (NFR5).
 */
describeIfConfigured('wardrobe_items RLS: cross-user isolation', () => {
  jest.setTimeout(30000);

  it("a second user cannot SELECT the first user's wardrobe_items row", async () => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);

    const stamp = Date.now();
    const password = 'Test-password-123!';
    const email1 = `rls-wardrobe-1-${stamp}@mailinator.com`;
    const email2 = `rls-wardrobe-2-${stamp}@mailinator.com`;

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

    const itemId = randomUUID();

    try {
      // User 1 inserts their own item, exactly as the app does (client-generated
      // id, paths shaped like the real Storage layout even though nothing is
      // actually uploaded here -- only the row's RLS is under test).
      const client1 = createClient(supabaseUrl!, supabasePublishableKey!);
      const signIn1 = await client1.auth.signInWithPassword({ email: email1, password });
      expect(signIn1.error).toBeNull();

      const insertResult = await client1.from('wardrobe_items').insert({
        id: itemId,
        user_id: user1Id,
        category: 'top',
        cutout_path: `${user1Id}/items/${itemId}/cutout.png`,
        thumb_path: `${user1Id}/items/${itemId}/thumb.webp`,
      });
      expect(insertResult.error).toBeNull();

      // User 2 -- a normal signed-in client, not the admin client -- tries
      // to read user 1's item.
      const client2 = createClient(supabaseUrl!, supabasePublishableKey!);
      const signIn2 = await client2.auth.signInWithPassword({ email: email2, password });
      expect(signIn2.error).toBeNull();

      const { data, error } = await client2
        .from('wardrobe_items')
        .select('*')
        .eq('id', itemId)
        .maybeSingle();

      // RLS denies the row rather than erroring: an empty result, not a thrown error.
      expect(error).toBeNull();
      expect(data).toBeNull();
    } finally {
      // Don't let throwaway RLS-check accounts/rows accumulate in a real project.
      await admin.from('wardrobe_items').delete().eq('id', itemId);
      if (user1Id) await admin.auth.admin.deleteUser(user1Id);
      if (user2Id) await admin.auth.admin.deleteUser(user2Id);
    }
  });

  /**
   * The SELECT test above only proves reads are isolated. RLS on this
   * table also has to stop a user from writing rows they don't own --
   * either by inserting a row under someone else's user_id, or by
   * reassigning/editing an existing row that isn't theirs -- which is a
   * distinct code path (`WITH CHECK` on INSERT/UPDATE) that a SELECT-only
   * test can't exercise.
   */
  it("a second user cannot INSERT or UPDATE a row under the first user's user_id", async () => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);

    const stamp = Date.now();
    const password = 'Test-password-123!';
    const email1 = `rls-wardrobe-write-1-${stamp}@mailinator.com`;
    const email2 = `rls-wardrobe-write-2-${stamp}@mailinator.com`;

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

    const itemId = randomUUID();
    const otherItemId = randomUUID();

    try {
      // User 1 inserts their own item, exactly as the app does.
      const client1 = createClient(supabaseUrl!, supabasePublishableKey!);
      const signIn1 = await client1.auth.signInWithPassword({ email: email1, password });
      expect(signIn1.error).toBeNull();

      const insertResult = await client1.from('wardrobe_items').insert({
        id: itemId,
        user_id: user1Id,
        category: 'top',
        cutout_path: `${user1Id}/items/${itemId}/cutout.png`,
        thumb_path: `${user1Id}/items/${itemId}/thumb.webp`,
      });
      expect(insertResult.error).toBeNull();

      // User 2 -- a normal signed-in client -- tries to INSERT a new row
      // impersonating user 1's ownership.
      const client2 = createClient(supabaseUrl!, supabasePublishableKey!);
      const signIn2 = await client2.auth.signInWithPassword({ email: email2, password });
      expect(signIn2.error).toBeNull();

      const impersonatedInsert = await client2.from('wardrobe_items').insert({
        id: otherItemId,
        user_id: user1Id,
        category: 'top',
        cutout_path: `${user1Id}/items/${otherItemId}/cutout.png`,
        thumb_path: `${user1Id}/items/${otherItemId}/thumb.webp`,
      });
      expect(impersonatedInsert.error).not.toBeNull();

      // User 2 tries to UPDATE user 1's existing row.
      const impersonatedUpdate = await client2
        .from('wardrobe_items')
        .update({ name: 'hijacked' })
        .eq('id', itemId);
      // RLS's USING clause filters out rows the caller doesn't own rather
      // than erroring -- zero rows affected, not a thrown error.
      expect(impersonatedUpdate.error).toBeNull();

      const { data: unchanged } = await admin
        .from('wardrobe_items')
        .select('name')
        .eq('id', itemId)
        .maybeSingle();
      expect(unchanged?.name).toBeNull();
    } finally {
      // Don't let throwaway RLS-check accounts/rows accumulate in a real project.
      await admin.from('wardrobe_items').delete().eq('id', itemId);
      await admin.from('wardrobe_items').delete().eq('id', otherItemId);
      if (user1Id) await admin.auth.admin.deleteUser(user1Id);
      if (user2Id) await admin.auth.admin.deleteUser(user2Id);
    }
  });
});
