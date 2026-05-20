import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { PageLoader } from '@/components/common/PageLoader';
import { MainLayout } from '@/components/MainLayout';
import { authService } from '@/services/authService';
import { auth } from '@/services/firebase';
import { useAuthStore } from '@/store/authStore';
import { AccountPage } from '@/pages/AccountPage';
import { AttendancePage } from '@/pages/AttendancePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StudentsPage } from '@/pages/StudentsPage';
import { ReportsPage } from '@/pages/ReportsPage';

function App(): JSX.Element {
  const isLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    void restoreSession();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setUser(null, null);
        return;
      }

      void authService.getCurrentUser().then(({ user, profile: currentProfile }) => {
        setUser(user, currentProfile);
      });
    });

    return () => {
      unsubscribe();
    };
  }, [restoreSession, setUser]);

  if (isLoading) {
    return <PageLoader label="Loading app..." />;
  }

  const mustChangePassword = false;

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          {!profile ? (
            <>
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : mustChangePassword ? (
            <>
              <Route path="/account/change-password" element={<AccountPage forceChange />} />
              <Route path="/account" element={<Navigate to="/account/change-password" replace />} />
              <Route path="*" element={<Navigate to="/account/change-password" replace />} />
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

export default App;
