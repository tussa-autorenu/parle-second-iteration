import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { Flow } from '@/src/scenes/Flow';

// Auth gate for the renter MVP. Once a session exists the whole prototype
// flow (loading → vehicle list → detail → ride) mounts inside <Flow />.
export default function Index() {
  const { isInitialized, isAuthenticated } = useAuth();

  if (!isInitialized) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#911cff" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href={'/auth/login' as never} />;
  }

  return <Flow />;
}
