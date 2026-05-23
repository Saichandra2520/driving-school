import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import type { Profile } from '@/types';

type AuthCallback = (user: unknown) => void;

const { callbacks } = vi.hoisted(() => ({
  callbacks: {
    authStateChanged: null as AuthCallback | null
  }
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth, callback: AuthCallback) => {
    callbacks.authStateChanged = callback;
    return vi.fn();
  })
}));

vi.mock('@/services/firebase', () => ({
  auth: {}
}));

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn(),
    signOut: vi.fn()
  }
}));

vi.mock('@/components/MainLayout', () => ({
  MainLayout: () => <div>App Layout</div>
}));

vi.mock('@/pages/LoginPage', () => ({
  LoginPage: () => <div>Login Page</div>
}));

vi.mock('@/pages/AccountPage', () => ({ AccountPage: () => <div /> }));
vi.mock('@/pages/AttendancePage', () => ({ AttendancePage: () => <div /> }));
vi.mock('@/pages/DashboardPage', () => ({ DashboardPage: () => <div /> }));
vi.mock('@/pages/ExpensesPage', () => ({ ExpensesPage: () => <div /> }));
vi.mock('@/pages/PaymentsPage', () => ({ PaymentsPage: () => <div /> }));
vi.mock('@/pages/ReportsPage', () => ({ ReportsPage: () => <div /> }));
vi.mock('@/pages/SettingsPage', () => ({ SettingsPage: () => <div /> }));
vi.mock('@/pages/StudentsPage', () => ({ StudentsPage: () => <div /> }));

const ownerProfile: Profile = {
  id: 'owner-1',
  fullName: 'Owner',
  role: 'owner',
  branchId: null
};

describe('App auth startup', () => {
  beforeEach(() => {
    callbacks.authStateChanged = null;
    vi.mocked(authService.getCurrentUser).mockReset();
    useAuthStore.setState({ user: null, profile: null, isLoading: true, authError: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('loads the profile once from the auth-state subscription', async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue({ user: { uid: 'owner-1' } as never, profile: ownerProfile });
    render(<App />);

    expect(screen.getByText('Loading app...')).toBeInTheDocument();

    await act(async () => {
      callbacks.authStateChanged?.({ uid: 'owner-1' });
    });

    await screen.findByText('App Layout');
    expect(authService.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('shows missing-profile state instead of redirecting to login', async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue({ user: { uid: 'owner-1' } as never, profile: null });
    render(<App />);

    await act(async () => {
      callbacks.authStateChanged?.({ uid: 'owner-1' });
    });

    await waitFor(() => {
      expect(screen.getByText('Profile setup required')).toBeInTheDocument();
    });
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
});
