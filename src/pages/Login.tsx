import { useState } from 'react';
import { useAuth } from '../store/AuthContext';
import { Banner, Button, Field, TextInput } from '../components/ui';

type Mode = 'in' | 'up' | 'forgot';

const TITLE: Record<Mode, string> = {
  in: 'Sign in',
  up: 'Create your login',
  forgot: 'Reset your password',
};

export default function Login() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setDone(null);

    if (!email.includes('@')) {
      setError('Type your email address.');
      return;
    }
    if (mode !== 'forgot' && password.length < 6) {
      setError('Use a password of at least 6 characters.');
      return;
    }

    setBusy(true);
    const problem =
      mode === 'in'
        ? await signIn(email, password)
        : mode === 'up'
          ? await signUp(email, password)
          : await resetPassword(email);
    setBusy(false);

    if (problem) {
      setError(problem);
      return;
    }
    if (mode === 'up') setDone('Check your email and click the link, then sign in.');
    if (mode === 'forgot') setDone('If that email has an account, a reset link is on its way.');
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-plane px-4 py-12 text-ink">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Family Budget</h1>
          <p className="mt-1 text-sm text-ink-2">Will &amp; Liz</p>
        </div>

        <div className="card rise p-6">
          <h2 className="text-base font-semibold">{TITLE[mode]}</h2>
          <p className="mt-1 mb-5 text-sm text-ink-2">
            {mode === 'in'
              ? 'Both of you use your own email and password.'
              : mode === 'up'
                ? 'Use your own email. You only do this once.'
                : 'We will email you a link to set a new password.'}
          </p>

          {error && (
            <Banner tone="critical" title="That did not work">
              {error}
            </Banner>
          )}
          {done && (
            <Banner tone="good" title="Done">
              {done}
            </Banner>
          )}

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field label="Email">
              {(id) => (
                <TextInput
                  id={id}
                  type="email"
                  autoComplete="email"
                  value={email}
                  placeholder="you@example.com"
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>

            {mode !== 'forgot' && (
              <Field label="Password" hint={mode === 'up' ? 'At least 6 characters.' : undefined}>
                {(id) => (
                  <TextInput
                    id={id}
                    type="password"
                    autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                )}
              </Field>
            )}

            <Button variant="primary" type="submit" disabled={busy} className="mt-1 w-full">
              {busy ? 'Working…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create login' : 'Send the link'}
            </Button>
          </form>

          <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-hairline pt-4 text-sm">
            {mode !== 'in' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('in');
                  setError(null);
                  setDone(null);
                }}
                className="text-ink-2 underline underline-offset-2 hover:text-ink"
              >
                Back to sign in
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMode('up');
                    setError(null);
                  }}
                  className="text-ink-2 underline underline-offset-2 hover:text-ink"
                >
                  Create a login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                  }}
                  className="text-ink-2 underline underline-offset-2 hover:text-ink"
                >
                  Forgot password
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Your budget is only visible to the two of you.
        </p>
      </div>
    </div>
  );
}
