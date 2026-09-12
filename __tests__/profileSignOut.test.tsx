import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn() },
    from: jest.fn(),
  },
}));
jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}));

import { router } from 'expo-router';
import Profile from '@/app/(tabs)/profile';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/auth/useSession';

let queryClient: QueryClient;

function renderProfile() {
  return render(
    <QueryClientProvider client={queryClient}>
      <Profile />
    </QueryClientProvider>,
  );
}

describe('Profile Sign Out', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // A fresh client per test, with GC disabled: React Query's cache
    // garbage-collection timer otherwise keeps Node's event loop alive
    // past the test, and `queryClient.clear()` below cancels it.
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    (useSession as jest.Mock).mockReturnValue({
      session: { user: { id: 'user-1' } },
      loading: false,
    });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { display_name: 'Test User' }, error: null }),
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('calls supabase.auth.signOut() and routes to Welcome when Sign Out is pressed', async () => {
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
    const user = userEvent.setup();

    await renderProfile();
    await waitFor(() => expect(screen.getByText('Test User')).toBeTruthy());
    await user.press(screen.getByText('Sign Out'));

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(router.replace).toHaveBeenCalledWith('/(auth)/welcome');
    });
  });
});
