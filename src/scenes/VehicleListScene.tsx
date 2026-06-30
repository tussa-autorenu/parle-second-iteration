import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInUp } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import type { FleetStatus, RedeemResult } from '@/lib/useAvailableFleet';
import type { Vehicle } from '@/src/data/vehicles';
import { ParleLogo } from '@/src/components/ParleLogo';
import { VehicleCard } from '@/src/components/VehicleCard';

type Props = {
  vehicles: Vehicle[];
  publicCount: number;
  sharedCount: number;
  status: FleetStatus;
  error: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onRedeemCode: (code: string) => Promise<RedeemResult>;
  onSelectVehicle: (id: string) => void;
  /** Tapping the Parlé logo resets the flow back to Loading. */
  onLogoTap: () => void;
  /** Long-press the logo to sign out. */
  onSignOut: () => void;
};

// ---- Entry choreography (option C: header → pause → staggered cards) --
const HEADER_ENTRY_MS = 500;
const HEADER_TO_CARDS_PAUSE_MS = 250;
const CARDS_START_DELAY_MS = HEADER_ENTRY_MS + HEADER_TO_CARDS_PAUSE_MS; // 750
const CARD_ENTRY_MS = 300;
const CARD_STAGGER_MS = 100;

/**
 * SCENE 2 — Available Vehicles.
 *
 * Layout:
 *   • Header: Parlé "P" mark + "PARLE" wordmark (regular weight), left-aligned.
 *     Tap resets the flow; long-press signs out.
 *   • Share-code entry: "Have a share code?" → input + Redeem (backend-wired).
 *   • Body: live vehicle cards — shared-access vehicles + the public fleet from
 *     Supabase — with pull-to-refresh.
 */
export function VehicleListScene({
  vehicles,
  status,
  error,
  isRefreshing,
  onRefresh,
  onRedeemCode,
  onSelectVehicle,
  onLogoTap,
  onSignOut,
}: Props) {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <StatusBar style="dark" />

      {/* ---- Header --------------------------------------------------- */}
      <Animated.View
        className="px-6 pt-4 pb-2"
        entering={FadeInUp.duration(HEADER_ENTRY_MS).easing(
          Easing.out(Easing.cubic)
        )}
      >
        {/* Parlé "P" mark + uppercase wordmark (regular weight). Tap resets the
            flow; long-press signs out. */}
        <Pressable
          onPress={onLogoTap}
          onLongPress={onSignOut}
          delayLongPress={600}
          hitSlop={8}
          className="flex-row items-center gap-2 self-start"
        >
          <ParleLogo width={31} height={30} />
          <Text
            className="font-space-grotesk text-parle-dark"
            style={{ fontSize: 26, letterSpacing: 0.5 }}
          >
            PARLE
          </Text>
        </Pressable>
      </Animated.View>

      {/* ---- Share-code entry ---------------------------------------- */}
      <ShareCodeSection onRedeemCode={onRedeemCode} />

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

/**
 * Collapsible "Have a share code?" entry. Wired to the backend redeem endpoint
 * via `onRedeemCode`; shows readable success / error messages inline. Renter
 * styling only — no Tesla controls, no owner dashboard affordances.
 */
function ShareCodeSection({
  onRedeemCode,
}: {
  onRedeemCode: (code: string) => Promise<RedeemResult>;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handleRedeem = async () => {
    if (busy || code.trim().length === 0) return;
    setBusy(true);
    setMessage(null);
    const result = await onRedeemCode(code);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) setCode('');
    setBusy(false);
  };

  return (
    <View className="px-4 pb-2">
      {!open ? (
        <Pressable
          onPress={() => setOpen(true)}
          className="rounded-2xl border border-parle-desat-3 bg-parle-desat-0 flex-row items-center justify-between px-4"
          style={{ height: 48 }}
        >
          <Text
            className="font-space-grotesk-medium text-parle-dark"
            style={{ fontSize: 14 }}
          >
            Have a share code?
          </Text>
          <Text
            className="font-space-grotesk-bold text-parle-logo"
            style={{ fontSize: 14 }}
          >
            Enter →
          </Text>
        </Pressable>
      ) : (
        <View className="rounded-2xl border border-parle-desat-3 bg-parle-desat-0 px-4 py-3 gap-2">
          <View className="flex-row items-center justify-between">
            <Text
              className="font-space-grotesk-medium text-parle-dark"
              style={{ fontSize: 14 }}
            >
              Enter your share code
            </Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text
                className="font-space-grotesk text-parle-desat-7"
                style={{ fontSize: 13 }}
              >
                Cancel
              </Text>
            </Pressable>
          </View>

          <View className="flex-row items-center gap-2">
            <TextInput
              className="flex-1 rounded-xl border border-parle-desat-3 bg-white px-3 font-space-grotesk text-parle-dark"
              style={{ height: 46, fontSize: 15 }}
              placeholder="e.g. ABC123"
              placeholderTextColor="#7a757f"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
              onSubmitEditing={handleRedeem}
              returnKeyType="go"
            />
            <Pressable
              onPress={handleRedeem}
              disabled={busy || code.trim().length === 0}
              className="bg-parle-logo rounded-xl items-center justify-center px-4"
              style={{
                height: 46,
                opacity: busy || code.trim().length === 0 ? 0.5 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text
                  className="font-space-grotesk-bold text-white"
                  style={{ fontSize: 14 }}
                >
                  Redeem
                </Text>
              )}
            </Pressable>
          </View>

          {message ? (
            <Text
              className="font-space-grotesk"
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: message.ok ? '#2E9C7F' : '#B91C1C',
              }}
            >
              {message.text}
            </Text>
          ) : null}
        </View>
      )}
    </View>
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
            Pull to refresh — available vehicles appear here, or enter a share
            code above for direct access.
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
