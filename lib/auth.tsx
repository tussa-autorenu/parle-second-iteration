import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { isSupabaseConfigured, supabase } from './supabase';

/** Sentinel thrown before hitting the network when env vars are absent. */
const NOT_CONFIGURED = 'SUPABASE_NOT_CONFIGURED';

/**
 * Turn any auth/network failure into a short, human-readable message so the
 * login/signup screens never surface a raw "Failed to fetch".
 */
export function getAuthErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const msg = raw.toLowerCase();

  if (msg.includes(NOT_CONFIGURED.toLowerCase())) {
    return 'Supabase isn’t configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env, then restart with `npx expo start -c`.';
  }
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('networkerror') ||
    msg.includes('fetch failed')
  ) {
    return 'Can’t reach Parlé right now. Check your connection and that your Supabase URL is correct, then try again.';
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (msg.includes('user not found') || msg.includes('no user found')) {
    return 'No account found for that email. Try signing up instead.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please confirm your email from the link we sent, then sign in.';
  }
  if (
    msg.includes('already registered') ||
    msg.includes('already exists') ||
    msg.includes('user already')
  ) {
    return 'An account with this email already exists. Try signing in.';
  }
  if (msg.includes('password should be at least') || msg.includes('weak password')) {
    return 'Password is too weak. Use at least 8 characters.';
  }
  if (msg.includes('too many requests') || msg.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return raw || 'Something went wrong. Please try again.';
}

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  userId: string | null;
  /** True once the initial session check has resolved. */
  isInitialized: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ session: Session | null }>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ session: Session | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Minimal Supabase-backed auth provider for the renter app. Keeps the session
 * in memory + AsyncStorage (via the supabase client) and exposes the handful
 * of helpers the login / signup screens and the home gate need.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn('[Auth] getSession error:', error.message);
        }
        setSession(data.session ?? null);
        setIsInitialized(true);
      })
      .catch((err) => {
        if (!active) return;
        console.warn('[Auth] getSession failed:', err);
        setIsInitialized(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setIsInitialized(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) throw new Error(NOT_CONFIGURED);
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) throw error;
    if (data.session) setSession(data.session);
    return { session: data.session };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) throw new Error(NOT_CONFIGURED);
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });
    if (error) throw error;
    if (data.session) setSession(data.session);
    return {
      session: data.session,
      // Supabase returns a user but no session when email confirmation is on.
      needsConfirmation: !data.session && !!data.user,
    };
  }, []);

  const signOut = useCallback(async () => {
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[Auth] signOut error:', err);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      userId: session?.user?.id ?? null,
      isInitialized,
      isAuthenticated: !!session,
      signIn,
      signUp,
      signOut,
    }),
    [session, isInitialized, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
