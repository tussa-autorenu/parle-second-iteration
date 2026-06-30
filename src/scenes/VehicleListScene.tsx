import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInUp } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import type { FleetStatus } from '@/lib/useAvailableFleet';
import type { Vehicle } from '@/src/data/vehicles';
import { ParleLogoFull } from '@/src/components/ParleLogoFull';
import { VehicleCard } from '@/src/components/VehicleCard';

type Props = {
  vehicles: Vehicle[];
  status: FleetStatus;
  error: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectVehicle: (id: string) => void;
  /** Tapping the Parle logo resets the flow back to Loading. */
  onLogoTap: () => void;
  /** Long-press the avatar to sign out. */
  onSignOut: () => void;
};

// ---- Entry choreography (option C: header → pause → staggered cards) --
const HEADER_ENTRY_MS = 500;
const HEADER_TO_CARDS_PAUSE_MS = 250;
const CARDS_START_DELAY_MS = HEADER_ENTRY_MS + HEADER_TO_CARDS_PAUSE_MS; // 750
const CARD_ENTRY_MS = 300;
const CARD_STAGGER_MS = 100;

const avatarImage = require('../../assets/avatar.png');

/**
 * SCENE 2 — Available Vehicles.
 *
 * Layout (Figma 166:260):
 *   • Header: Parle wordmark + "Available nearby · N" chip — left.
 *             Circular user avatar — right (long-press to sign out).
 *   • Body: vertical stack of live vehicle cards from Supabase
 *           (gap 16px, side padding 16px), with pull-to-refresh.
 *
 * Entry: header rises + fades in over 500ms → 250ms pause → cards stagger
 * in 100ms apart, 300ms each.
 */
export function VehicleListScene({
  vehicles,
  status,
  error,
  isRefreshing,
  onRefresh,
  onSelectVehicle,
  onLogoTap,
  onSignOut,
}: Props) {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <StatusBar style="dark" />

      {/* ---- Header --------------------------------------------------- */}
      <Animated.View
        className="flex-row items-start justify-between px-6 py-4"
        entering={FadeInUp.duration(HEADER_ENTRY_MS).easing(
          Easing.out(Easing.cubic)
        )}
      >
        <View className="gap-3" style={{ width: 165 }}>
          <Pressable onPress={onLogoTap} hitSlop={8}>
            <ParleLogoFull width={120} height={35} />
          </Pressable>
          <View className="flex-row items-center gap-2">
            <Text
              className="font-space-grotesk text-parle-desat-7"
              style={{ fontSize: 16 }}
            >
              Available nearby
            </Text>
            {/* Count chip — small rounded square, light desat bg,
                accent-primary number. */}
            <View
              className="items-center justify-center rounded-md bg-parle-desat-1 px-2"
              style={{ height: 24 }}
            >
              <Text
                className="font-space-grotesk-bold text-parle-logo"
                style={{ fontSize: 13 }}
              >
                {vehicles.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Avatar — 48×48 circle, 2px desat-3 border. Long-press signs out. */}
        <Pressable
          onLongPress={onSignOut}
          delayLongPress={400}
          className="rounded-full border-2 border-parle-desat-3 overflow-hidden"
          style={{ width: 48, height: 48 }}
        >
          <Image
            source={avatarImage}
            contentFit="cover"
            style={{ width: '100%', height: '100%' }}
          />
        </Pressable>
      </Animated.View>

      {/* ---- Body ----------------------------------------------------- */}
      <Body
        vehicles={vehicles}
        status={status}
        error={error}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        onSelectVehicle={onSelectVehicle}
      />
    </SafeAreaView>
  );
}

function Body({
  vehicles,
  status,
  error,
  isRefreshing,
  onRefresh,
  onSelectVehicle,
}: Pick<
  Props,
  | 'vehicles'
  | 'status'
  | 'error'
  | 'isRefreshing'
  | 'onRefresh'
  | 'onSelectVehicle'
>) {
  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center gap-3">
        <ActivityIndicator color="#911cff" />
        <Text
          className="font-space-grotesk text-parle-desat-7"
          style={{ fontSize: 14 }}
        >
          Finding available vehicles…
        </Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#911cff"
          />
        }
      >
        <View className="flex-1 items-center justify-center px-10 gap-3">
          <Text
            className="font-space-grotesk-bold text-parle-dark text-center"
            style={{ fontSize: 18 }}
          >
            Couldn’t load vehicles
          </Text>
          <Text
            className="font-space-grotesk text-parle-desat-7 text-center"
            style={{ fontSize: 14, lineHeight: 20 }}
          >
            {error ?? 'Something went wrong.'}
          </Text>
          <Pressable
            onPress={onRefresh}
            className="bg-parle-logo rounded-2xl items-center justify-center px-6 mt-2"
            style={{ height: 48 }}
          >
            <Text
              className="font-space-grotesk-bold text-white"
              style={{ fontSize: 15 }}
            >
              Try again
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // status === 'ready'
  if (vehicles.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#911cff"
          />
        }
      >
        <View className="flex-1 items-center justify-center px-10 gap-2">
          <Text
            className="font-space-grotesk-bold text-parle-dark text-center"
            style={{ fontSize: 18 }}
          >
            No vehicles available
          </Text>
          <Text
            className="font-space-grotesk text-parle-desat-7 text-center"
            style={{ fontSize: 14, lineHeight: 20 }}
          >
            Pull to refresh — new vehicles appear here the moment an owner makes
            one available.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor="#911cff"
        />
      }
    >
      <View className="gap-4">
        {vehicles.map((vehicle, index) => (
          <Animated.View
            key={vehicle.id}
            entering={FadeInUp.duration(CARD_ENTRY_MS)
              .delay(CARDS_START_DELAY_MS + index * CARD_STAGGER_MS)
              .easing(Easing.out(Easing.cubic))}
          >
            <VehicleCard
              vehicle={vehicle}
              onPress={() => onSelectVehicle(vehicle.id)}
            />
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}
