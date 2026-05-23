import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { PageLoader } from '@/components/common/PageLoader';
import { MainLayout } from '@/components/MainLayout';
import { Button } from '@/components/ui/button';
import { authService } from '@/services/authService';
import { auth } from '@/services/firebase';
import { useAuthStore } from '@/store/authStore';
import { AccountPage } from '@/pages/AccountPage';
import { AttendancePage } from '@/pages/AttendancePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StudentsPage } from '@/pages/StudentsPage';
import { ReportsPage } from '@/pages/ReportsPage';

function App(): JSX.Element {
  const isLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const authError = useAuthStore((state) => state.authError);
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);
  const signOut = useAuthStore((state) => state.signOut);

  useEffect(() => {
    setLoading(true);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setUser(null, null);
        return;
      }

      void authService.getCurrentUser()
        .then(({ user: currentAuthUser, profile: currentProfile }) => {
          setUser(
            currentAuthUser,
            currentProfile,
            currentAuthUser && !currentProfile
              ? 'Signed in account is missing a user profile. Ask the owner to create the Firestore users profile.'
              : null
          );
        })
        .catch((error) => {
          console.error('Failed to load auth profile:', error);
          setUser(currentUser, null, 'Unable to load your user profile. Check your connection and try again.');
        });
    });

    return () => {
      unsubscribe();
    };
  }, [setLoading, setUser]);

  if (isLoading) {
    return <PageLoader label="Loading app..." />;
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          {!profile && user ? (
            <Route path="*" element={<MissingProfilePage message={authError} onSignOut={() => void signOut()} />} />
          ) : !profile ? (
            <>
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="students" element={<StudentsPage />} />
                <Route path="attendance" element={<AttendancePage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="expenses" element={<ExpensesPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="account/change-password" element={<AccountPage />} />
              </Route>
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}

function MissingProfilePage({ message, onSignOut }: { message: string | null; onSignOut: () => void }): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-md border bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Profile setup required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {message ?? 'Signed in account is missing a user profile. Ask the owner to create the Firestore users profile.'}
        </p>
        <Button type="button" className="mt-5 w-full" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </main>
  );
}

export default App;
