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

import { supabase } from './supabase';

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
