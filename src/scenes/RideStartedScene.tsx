import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { BoltIcon, CheckIcon, LockIcon, LockOpenIcon } from '@/src/components/Icons';
import type { Vehicle } from '@/src/data/vehicles';
import {
  lockVehicle,
  readyDriveVehicle,
  unlockVehicle,
  type VehicleCommand,
} from '@/lib/vehicleCommands';

// ---- Entry choreography -------------------------------------------------
const SUCCESS_SPRING_CONFIG = { damping: 9, stiffness: 110 };
// Each row of the screen fades up + slides in from below, staggered ~100ms.
const ROW_ENTRY_MS = 300;
const TITLE_DELAY = 100;
const SUBTITLE_DELAY = 200;
const CARD_DELAY = 300;
const ACTIONS_DELAY = 400;
const DISCLAIMER_DELAY = 500;
const CTA_DELAY = 550;

type Props = {
  vehicle: Vehicle | null;
  /** Epoch ms the ride started; drives the live duration timer. */
  rideStartedAt: number | null;
  onEndRide: () => void;
};

/** Format elapsed ms → MM:SS, or H:MM:SS once past an hour. */
function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * SCENE 4 — Ride Started (active ride).
 *
 * Keeps the original Parlé success layout but is now a real active-ride
 * screen:
 *   • Purple success badge + headline + subtitle.
 *   • Trip card: car name/color + TRIP id + live DURATION and BATTERY tiles
 *     (no map, no distance, no running/total cost).
 *   • Real vehicle commands: Lock / Unlock / Ready Drive (backend-wired).
 *   • End Ride: locks the car first; only ends the ride if the lock succeeds,
 *     otherwise shows an error and lets the renter retry.
 */
export function RideStartedScene({ vehicle, rideStartedAt, onEndRide }: Props) {
  // Trip ID — stable per mount, different each session. 4-digit suffix.
  const [tripId] = useState(
    () => `PLR-${Math.floor(1000 + Math.random() * 9000)}`
  );

  // ---- Live duration timer ---------------------------------------------
  const [elapsedMs, setElapsedMs] = useState(() =>
    rideStartedAt ? Date.now() - rideStartedAt : 0
  );
  useEffect(() => {
    if (!rideStartedAt) return;
    const tick = () => setElapsedMs(Date.now() - rideStartedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [rideStartedAt]);

  // ---- Success badge: pop in on mount via spring ------------------------
  const checkScale = useSharedValue(0);
  useEffect(() => {
    checkScale.value = withSpring(1, SUCCESS_SPRING_CONFIG);
  }, [checkScale]);
  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  // ---- Command state ----------------------------------------------------
  const commandVehicleId = vehicle?.commandVehicleId ?? null;
  // The backend command routes need the real vehicle identifier. Without it we
  // can't safely send anything, so controls are disabled (never faked).
  const canCommand = !!commandVehicleId;
  const [busy, setBusy] = useState<VehicleCommand | 'end' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const runCommand = async (command: VehicleCommand) => {
    if (busy || !canCommand) return;
    setBusy(command);
    setMessage(null);
    const fn =
      command === 'lock'
        ? lockVehicle
        : command === 'unlock'
          ? unlockVehicle
          : readyDriveVehicle;
    const result = await fn(commandVehicleId);
    setMessage({ ok: result.ok, text: result.message });
    setBusy(null);
  };

  const handleEndRide = async () => {
    if (busy) return;
    // No command identifier → we can't lock this vehicle; end without faking it.
    if (!canCommand) {
      onEndRide();
      return;
    }
    setBusy('end');
    setMessage(null);
    // Always attempt to lock the vehicle before ending — never end silently.
    const result = await lockVehicle(commandVehicleId);
    if (result.ok) {
      setBusy(null);
      onEndRide();
    } else {
      setMessage({
        ok: false,
        text: `Couldn’t lock the vehicle: ${result.message} Tap End Ride to retry.`,
      });
      setBusy(null);
    }
  };

  const modelLabel = vehicle?.model ?? 'Tesla';
  const colorLabel = vehicle?.color ?? 'White';
  const batteryLabel = vehicle?.batteryPct == null ? '—' : `${vehicle.batteryPct}%`;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Success badge ---- */}
        <Animated.View
          className="self-center items-center justify-center mt-6"
          style={[{ width: 80, height: 80 }, checkAnimatedStyle]}
        >
          {/* Soft outer halo */}
          <View
            style={{
              position: 'absolute',
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: 'rgba(145, 28, 255, 0.15)',
            }}
          />
          {/* Filled inner circle */}
          <View
            className="items-center justify-center"
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: '#911cff',
              boxShadow: '0 8px 16px rgba(145, 28, 255, 0.3)',
            }}
          >
            <CheckIcon size={28} color="#ffffff" />
          </View>
        </Animated.View>

        {/* ---- Headline ---- */}
        <Animated.View
          className="mt-4"
          entering={FadeInUp.duration(ROW_ENTRY_MS)
            .delay(TITLE_DELAY)
            .easing(Easing.out(Easing.cubic))}
        >
          <Text
            className="font-space-grotesk-bold text-parle-dark text-center"
            style={{ fontSize: 26, letterSpacing: -0.52 }}
          >
            Ride Started!
          </Text>
        </Animated.View>

        {/* ---- Subtitle ---- */}
        <Animated.View
          className="mt-2 px-10"
          entering={FadeInUp.duration(ROW_ENTRY_MS)
            .delay(SUBTITLE_DELAY)
            .easing(Easing.out(Easing.cubic))}
        >
          <Text
            className="font-space-grotesk text-parle-desat-7 text-center"
            style={{ fontSize: 14, lineHeight: 22 }}
          >
            Your {modelLabel} is unlocked and ready.{'\n'}Enjoy your ride!
          </Text>
        </Animated.View>

        {/* ---- Trip Card (no map / distance / cost) ---- */}
        <Animated.View
          className="mx-6 mt-6 bg-white rounded-2xl overflow-hidden px-4 py-4"
          style={{
            // 3-layer purple-tinted shadow from Figma.
            boxShadow:
              '0 2px 4px -1px rgba(145, 28, 255, 0.06), 0 4px 8px -2px rgba(145, 28, 255, 0.1), 0 8px 16px -4px rgba(145, 28, 255, 0.05)',
          }}
          entering={FadeInUp.duration(ROW_ENTRY_MS)
            .delay(CARD_DELAY)
            .easing(Easing.out(Easing.cubic))}
        >
          <Text
            className="font-space-grotesk-bold text-parle-dark"
            style={{ fontSize: 16 }}
          >
            {modelLabel} · {colorLabel}
          </Text>
          <Text
            className="font-space-mono text-parle-desat-7 mt-1"
            style={{ fontSize: 10, letterSpacing: 0.5 }}
          >
            TRIP #{tripId}
          </Text>

          {/* Live stat tiles — duration + battery only */}
          <View className="flex-row gap-2 mt-4">
            <StatTile label="DURATION" value={formatElapsed(elapsedMs)} />
            <StatTile label="BATTERY" value={batteryLabel} />
          </View>
        </Animated.View>

        {/* ---- Vehicle command controls ---- */}
        <Animated.View
          className="mx-6 mt-4"
          entering={FadeInUp.duration(ROW_ENTRY_MS)
            .delay(ACTIONS_DELAY)
            .easing(Easing.out(Easing.cubic))}
        >
          <View className="flex-row gap-2">
            <CommandTile
              icon={<LockIcon />}
              label="Lock"
              busy={busy === 'lock'}
              disabled={busy !== null || !canCommand}
              onPress={() => runCommand('lock')}
            />
            <CommandTile
              icon={<LockOpenIcon />}
              label="Unlock"
              busy={busy === 'unlock'}
              disabled={busy !== null || !canCommand}
              onPress={() => runCommand('unlock')}
            />
            <CommandTile
              icon={<BoltIcon />}
              label="Ready Drive"
              busy={busy === 'ready-drive'}
              disabled={busy !== null || !canCommand}
              onPress={() => runCommand('ready-drive')}
            />
          </View>

          {/* Controls need the real backend vehicle id — say so plainly. */}
          {!canCommand ? (
            <Text
              className="font-space-grotesk mt-3 text-center"
              style={{ fontSize: 13, lineHeight: 18, color: '#B91C1C' }}
            >
              Controls are unavailable for this vehicle: it’s missing a connected
              vehicle identifier.
            </Text>
          ) : null}

          {/* Inline command result / error */}
          {message ? (
            <Text
              className="font-space-grotesk mt-3 text-center"
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: message.ok ? '#2E9C7F' : '#B91C1C',
              }}
            >
              {message.text}
            </Text>
          ) : null}
        </Animated.View>

        {/* ---- Auto-lock disclaimer ---- */}
        <Animated.View
          className="px-10 mt-6"
          entering={FadeInUp.duration(ROW_ENTRY_MS)
            .delay(DISCLAIMER_DELAY)
            .easing(Easing.out(Easing.cubic))}
        >
          <Text
            className="font-space-grotesk text-parle-desat-7 text-center"
            style={{ fontSize: 12, lineHeight: 18 }}
          >
            Vehicle will lock automatically when you end your ride. Drive safe!
          </Text>
        </Animated.View>

        {/* ---- End Ride CTA (locks first) ---- */}
        <Animated.View
          className="mx-6 mt-4"
          entering={FadeInUp.duration(ROW_ENTRY_MS)
            .delay(CTA_DELAY)
            .easing(Easing.out(Easing.cubic))}
        >
          <Pressable
            onPress={handleEndRide}
            disabled={busy !== null}
            className="bg-parle-dark rounded-2xl flex-row items-center justify-center gap-2"
            style={{
              height: 52,
              opacity: busy !== null && busy !== 'end' ? 0.6 : 1,
              boxShadow: '0 6px 12px rgba(29, 6, 51, 0.2)',
            }}
          >
            {busy === 'end' ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text
                className="font-space-grotesk-bold text-white"
                style={{ fontSize: 16 }}
              >
                End Ride
              </Text>
            )}
          </Pressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ====================== Local helper components ====================== */

/** One live stat tile below the trip header (duration / battery). */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View
      className="flex-1 items-center justify-center rounded-xl border border-parle-desat-3 bg-parle-desat-0"
      style={{ height: 60 }}
    >
      <Text
        className="font-space-mono text-parle-desat-7"
        style={{ fontSize: 9, letterSpacing: 0.5 }}
      >
        {label}
      </Text>
      <Text
        className="font-space-grotesk-bold text-parle-dark"
        style={{ fontSize: 16, marginTop: 2 }}
      >
        {value}
      </Text>
    </View>
  );
}

/** One backend-wired command tile (Lock / Unlock / Ready Drive). */
function CommandTile({
  icon,
  label,
  busy,
  disabled,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="flex-1 items-center justify-center bg-white border border-parle-desat-3 rounded-xl gap-1"
      style={{
        height: 72,
        opacity: disabled && !busy ? 0.5 : 1,
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
      }}
    >
      {busy ? <ActivityIndicator color="#A749FF" /> : icon}
      <Text
        className="font-space-grotesk-medium text-parle-desat-7"
        style={{ fontSize: 10 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
