import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { isCloudConfigured, supabase } from '../lib/supabase';
import { cleanInviteCode, ensureHousehold, joinHousehold } from '../lib/remote';

export type AuthState = 'loading' | 'local' | 'signed-out' | 'signed-in';

interface AuthValue {
  state: AuthState;
  session: Session | null;
  /** The household the signed-in person belongs to. */
  householdId: string | null;
  email: string | null;
  userId: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  /** `inviteCode` is the household code from the other person's Settings page.
   *  Left empty, this person starts a budget of their own. */
  signUp: (email: string, password: string, inviteCode?: string) => Promise<string | null>;
  /** For someone who signed up before they were given the code and is now
   *  sitting in an empty budget of their own. */
  joinWithCode: (inviteCode: string) => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Turn Supabase's wording into something worth reading. */
function friendly(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('invalid login')) return 'That email and password do not match. Try again.';
  if (text.includes('email not confirmed')) {
    return 'Check your email and click the link first, then sign in.';
  }
  if (text.includes('already registered')) {
    return 'That email already has an account. Sign in instead.';
  }
  if (text.includes('password should be')) return 'Use a password of at least 6 characters.';
  if (text.includes('rate limit') || text.includes('too many')) {
    return 'Too many tries. Wait a minute and try again.';
  }
  if (text.includes('failed to fetch') || text.includes('network')) {
    return 'Could not reach the internet. Check your connection and try again.';
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // With no keys set the app runs on this browser's own storage, so local
  // development and the preview build work without any account at all.
  const cloud = isCloudConfigured();
  const [state, setState] = useState<AuthState>(cloud ? 'loading' : 'local');
  const [session, setSession] = useState<Session | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  /* The code is typed on the sign-up form but only usable once Supabase hands
     back a session, which arrives separately through onAuthStateChange. A ref
     carries it across that gap without re-running the listener. */
  const pendingCode = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!cloud) return;
    const db = supabase();

    const apply = async (next: Session | null) => {
      setSession(next);
      if (!next) {
        setHouseholdId(null);
        setState('signed-out');
        return;
      }
      try {
        const code = pendingCode.current;
        pendingCode.current = undefined;
        setHouseholdId(await ensureHousehold(code));
        setState('signed-in');
      } catch {
        // Signed in but the household lookup failed — usually the schema has
        // not been run yet. Better to say so than to show an empty budget.
        setHouseholdId(null);
        setState('signed-in');
      }
    };

    void db.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = db.auth.onAuthStateChange((_event, next) => void apply(next));
    return () => sub.subscription.unsubscribe();
  }, [cloud]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    return error ? friendly(error.message) : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, inviteCode?: string) => {
    const code = inviteCode?.trim();
    if (code) {
      const tidy = cleanInviteCode(code);
      // Caught before creating the account, so a typo does not leave a login
      // sitting in a budget of its own.
      if (!tidy) return 'That does not look like a code. Copy the whole thing and try again.';
      pendingCode.current = tidy;
    }

    const { error } = await supabase().auth.signUp({ email, password });
    if (error) {
      pendingCode.current = undefined;
      return friendly(error.message);
    }
    return null;
  }, []);

  const joinWithCode = useCallback(async (inviteCode: string) => {
    try {
      setHouseholdId(await joinHousehold(inviteCode));
      return null;
    } catch (error) {
      return friendly(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return error ? friendly(error.message) : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      state,
      session,
      householdId,
      email: session?.user.email ?? null,
      userId: session?.user.id ?? null,
      signIn,
      signUp,
      joinWithCode,
      resetPassword,
      signOut,
    }),
    [state, session, householdId, signIn, signUp, joinWithCode, resetPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
