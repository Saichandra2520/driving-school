import { FormEvent, useState } from 'react';
import { MaryLogo } from '@/components/common/MaryLogo';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';

export function LoginPage(): JSX.Element {
  const setUser = useAuthStore((state) => state.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const { user, profile } = await authService.signIn(email.trim(), password);

      if (!profile) {
        await authService.signOut();
        throw new Error('Signed in account is missing a user profile. Ask the owner to create the Firestore users profile.');
      }

      setUser(user, profile);
    } catch (error) {
      setErrorMessage(getLoginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <MaryLogo className="h-24 w-32" />
          <div className="space-y-1">
            <CardTitle>Mary Driving School</CardTitle>
            <CardDescription>Sign in to manage students, fees, and branch operations.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {errorMessage ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
                {errorMessage}
              </p>
            ) : null}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function getLoginErrorMessage(error: unknown): string {
  const code = getErrorCode(error);

  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/user-not-found':
      return 'No account was found for this email address.';
    case 'auth/wrong-password':
      return 'The password is incorrect. Please try again.';
    case 'auth/invalid-credential':
      return 'The email address or password is incorrect. Please check both and try again.';
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Unable to connect. Please check your internet connection and try again.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : 'Unable to sign in. Please check your email and password.';
  }
}

function getErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : '';
  }

  return '';
}
