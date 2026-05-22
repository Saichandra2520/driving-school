import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirebaseUsageMetrics } from '@/components/settings/FirebaseUsageMetrics';
import { firebaseUsageService } from '@/services/firebaseUsageService';
import { useAuthStore } from '@/store/authStore';
import type { FirebaseUsageMetrics as FirebaseUsageMetricsResponse, Profile } from '@/types';

vi.mock('@/services/firebaseUsageService', () => ({
  firebaseUsageService: {
    getUsageMetrics: vi.fn(),
    flushPendingUsage: vi.fn(),
    subscribe: vi.fn(() => vi.fn())
  }
}));

const ownerProfile: Profile = {
  id: 'owner-1',
  fullName: 'Owner',
  role: 'owner',
  branchId: null
};

const staffProfile: Profile = {
  id: 'staff-1',
  fullName: 'Staff',
  role: 'staff',
  branchId: 'branch1'
};

const usageResponse: FirebaseUsageMetricsResponse = {
  quotaDayStart: '2026-05-22T07:00:00.000Z',
  quotaDayEnd: '2026-05-22T12:00:00.000Z',
  generatedAt: '2026-05-22T12:00:00.000Z',
  freshnessNote: 'Approximate consolidated estimate from signed-in app users. Firebase Console billing usage can be different.',
  metrics: {
    reads: { used: 12000, limit: 50000, percentUsed: 24 },
    writes: { used: 17000, limit: 20000, percentUsed: 85 },
    deletes: { used: 19500, limit: 20000, percentUsed: 97.5 }
  }
};

describe('FirebaseUsageMetrics', () => {
  beforeEach(() => {
    vi.mocked(firebaseUsageService.getUsageMetrics).mockResolvedValue(usageResponse);
    vi.mocked(firebaseUsageService.subscribe).mockImplementation(() => vi.fn());
    useAuthStore.setState({ user: null, profile: ownerProfile, isLoading: false });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows owner-only Firebase usage metrics', async () => {
    render(<FirebaseUsageMetrics />);

    expect(await screen.findByText('Firebase Usage')).toBeInTheDocument();
    expect(screen.getByText('12,000')).toBeInTheDocument();
    expect(screen.getByText('/ 50,000')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('97.5%')).toBeInTheDocument();
  });

  it('does not render for staff users', () => {
    useAuthStore.setState({ user: null, profile: staffProfile, isLoading: false });

    const { container } = render(<FirebaseUsageMetrics />);

    expect(container).toBeEmptyDOMElement();
    expect(firebaseUsageService.getUsageMetrics).not.toHaveBeenCalled();
  });

  it('shows backend errors and retries on refresh', async () => {
    const user = userEvent.setup();
    vi.mocked(firebaseUsageService.getUsageMetrics)
      .mockRejectedValueOnce(new Error('Only owners can view Firebase usage metrics.'))
      .mockResolvedValueOnce(usageResponse);

    render(<FirebaseUsageMetrics />);

    expect(await screen.findByText('Only owners can view Firebase usage metrics.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(firebaseUsageService.getUsageMetrics).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('12,000')).toBeInTheDocument();
  });
});
