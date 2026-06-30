import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Add them to a .env file (see .env.example) and restart with `npx expo start -c`. ' +
      'Until then, login and the fleet feed will show an error state instead of crashing.'
  );
}

/**
 * Storage adapters chosen per platform so AsyncStorage (which touches
 * `window`/native modules) never runs during web/server rendering:
 *   • native (iOS/Android)  → AsyncStorage
 *   • web in a browser      → localStorage-backed adapter
 *   • web during SSR/export → no-op memory adapter (never references window)
 */
const noopStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => {},
  removeItem: async (_key: string) => {},
};

const webStorage = {
  getItem: async (key: string) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};

const storage =
  Platform.OS === 'web'
    ? typeof window === 'undefined'
      ? noopStorage
      : webStorage
    : AsyncStorage;

const authOptions: SupabaseClientOptions<'public'>['auth'] = {
  storage,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
};

// Fall back to harmless placeholders ONLY when env vars are absent, so an
// unconfigured project still boots (with a clear warning above) instead of
// crashing Metro / Expo Router at import time. Real env vars always win.
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  { auth: authOptions }
);
