import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAuthErrorMessage, useAuth } from '@/lib/auth';
import { ParleLogoFull } from '@/src/components/ParleLogoFull';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  const handleSignIn = async () => {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(email, password);
      // Auth state listener flips index to the Flow; replace to home.
      router.replace('/' as never);
    } catch (err) {
      console.warn('[Login] sign-in failed:', err);
      setError(getAuthErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center mb-8 gap-3">
            <ParleLogoFull width={150} height={44} />
            <Text
              className="font-space-grotesk-bold text-parle-dark"
              style={{ fontSize: 26, letterSpacing: -0.52 }}
            >
              Welcome back
            </Text>
            <Text
              className="font-space-grotesk text-parle-desat-7 text-center"
              style={{ fontSize: 15, lineHeight: 22 }}
            >
              Sign in to find Teslas available near you.
            </Text>
          </View>

          {error ? (
            <View
              className="rounded-2xl px-4 py-3 mb-4"
              style={{ backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#ffd7d7' }}
            >
              <Text
                className="font-space-grotesk-medium"
                style={{ color: '#B91C1C', fontSize: 13, lineHeight: 18 }}
              >
                {error}
              </Text>
            </View>
          ) : null}

          <View className="gap-3">
            <TextInput
              className="rounded-2xl border border-parle-desat-3 bg-parle-desat-0 px-4 font-space-grotesk text-parle-dark"
              style={{ height: 54, fontSize: 16 }}
              placeholder="Email"
              placeholderTextColor="#7a757f"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TextInput
              className="rounded-2xl border border-parle-desat-3 bg-parle-desat-0 px-4 font-space-grotesk text-parle-dark"
              style={{ height: 54, fontSize: 16 }}
              placeholder="Password"
              placeholderTextColor="#7a757f"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
            />
          </View>

          <Pressable
            onPress={handleSignIn}
            disabled={!canSubmit}
            className="bg-parle-logo rounded-2xl items-center justify-center mt-5"
            style={{ height: 56, opacity: canSubmit ? 1 : 0.5, boxShadow: '0 6px 16px rgba(29, 6, 51, 0.3)' }}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="font-space-grotesk-bold text-white" style={{ fontSize: 17 }}>
                Sign In
              </Text>
            )}
          </Pressable>

          <View className="flex-row items-center justify-center gap-1.5 mt-6">
            <Text className="font-space-grotesk text-parle-desat-7" style={{ fontSize: 14 }}>
              Don’t have an account?
            </Text>
            <Pressable onPress={() => router.push('/auth/signup' as never)} hitSlop={8}>
              <Text className="font-space-grotesk-bold text-parle-logo" style={{ fontSize: 14 }}>
                Sign Up
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
