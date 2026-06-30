import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
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
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';

import {
  ChatCircleDotsIcon,
  CheckIcon,
  LockIcon,
  SunIcon,
  VolumeMaxIcon,
} from '@/src/components/Icons';
import type { Vehicle } from '@/src/data/vehicles';

const mapImage = require('../../assets/map.png');

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
const REPORT_DELAY = 600;

// LIVE pill — soft pulsing white dot to suggest "active" status.
const LIVE_PULSE_MS = 600;

type Props = {
  vehicle: Vehicle | null;
  onEndRide: () => void;
};

/**
 * SCENE 4 — Ride Started.
 *
 * Visuals (Figma 184:105):
 *   • Purple success badge with a white check (springs in on mount).
 *   • Headline + 2-line subtitle.
 *   • Live Trip Card: map snippet with bottom fade-to-white, LIVE pill +
 *     you-are-here dot overlaid, then car name + trip ID + 3 stat tiles
 *     + running total.
 *   • 4 quick-action tiles (Lock Car / Climate / Horn / Support).
 *   • Auto-lock disclaimer.
 *   • Dark "End Ride" CTA.
 *   • Purple "Report an issue" link.
 *
 * Data binding: the selected `vehicle` (the live Supabase row the renter
 * unlocked on the detail screen) is passed in, so the car name / color /
 * battery / rate carry through here. Trip stats (duration, distance) are
 * illustrative; running-total is proportional to the selected car's rate so
 * higher-priced cars show a higher current spend.
 */
export function RideStartedScene({ vehicle, onEndRide }: Props) {
  // Trip ID — generated once per mount so it stays stable while the user
  // is on this screen but is different each session. 4-digit suffix.
  const [tripId] = useState(
    () => `PLR-${Math.floor(1000 + Math.random() * 9000)}`
  );

  // ---- Success badge: pop in on mount via spring ------------------------
  const checkScale = useSharedValue(0);
  useEffect(() => {
    checkScale.value = withSpring(1, SUCCESS_SPRING_CONFIG);
  }, [checkScale]);
  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  // ---- LIVE pill dot: gentle pulsing opacity loop -----------------------
  const liveDotOpacity = useSharedValue(1);
  useEffect(() => {
    liveDotOpacity.value = withRepeat(
      withSequence(
        withTiming(0.25, {
          duration: LIVE_PULSE_MS,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(1, {
          duration: LIVE_PULSE_MS,
          easing: Easing.inOut(Easing.quad),
        })
      ),
      -1,
      false
    );
  }, [liveDotOpacity]);
  const liveDotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: liveDotOpacity.value,
  }));

  // Defensive — if for some reason we got here without a vehicle, fall
  // back to a generic display so the screen doesn't blow up.
  const modelLabel = vehicle?.model ?? 'Tesla';
  const colorLabel = vehicle?.color ?? 'White';
  const hourlyRate = vehicle?.hourlyRate ?? 38;
  const startingBattery = vehicle?.batteryPct ?? 92;

  // Trip stats — duration, distance, running-total kept consistent with
  // the Figma example for Model 3 ($6.33 / 0:04:32 / 0.8 mi). Battery
  // drops 1% off the starting state so the figure feels live-ish.
  const battery = Math.max(0, startingBattery - 1);
  const duration = '0:04:32';
  const distance = '0.8 mi';
  // 0.1666 × hourly_rate ≈ Figma's $6.33 for the $38/hr Model 3.
  const runningTotal = (hourlyRate * 0.1666).toFixed(2);

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      edges={['top', 'bottom']}
    >
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

        {/* ---- Live Trip Card ---- */}
        <Animated.View
          className="mx-6 mt-6 bg-white rounded-2xl overflow-hidden"
          style={{
            // 3-layer purple-tinted shadow from Figma.
            boxShadow:
              '0 2px 4px -1px rgba(145, 28, 255, 0.06), 0 4px 8px -2px rgba(145, 28, 255, 0.1), 0 8px 16px -4px rgba(145, 28, 255, 0.05)',
          }}
          entering={FadeInUp.duration(ROW_ENTRY_MS)
            .delay(CARD_DELAY)
            .easing(Easing.out(Easing.cubic))}
        >
          {/* Map area with fade + LIVE pill + you-are-here */}
          <View style={{ height: 140 }} className="overflow-hidden">
            <Image
              source={mapImage}
              contentFit="cover"
              style={{ width: '100%', height: '100%' }}
            />

            {/* Bottom fade to white — built with `react-native-svg`'s
                LinearGradient so we don't need a separate gradient lib. */}
            <Svg
              width="100%"
              height={70}
              style={{ position: 'absolute', bottom: 0, left: 0 }}
            >
              <Defs>
                <LinearGradient
                  id="mapFade"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <Stop
                    offset="0"
                    stopColor="#ffffff"
                    stopOpacity={0}
                  />
                  <Stop
                    offset="1"
                    stopColor="#ffffff"
                    stopOpacity={1}
                  />
                </LinearGradient>
              </Defs>
              <Rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="url(#mapFade)"
              />
            </Svg>

            {/* LIVE pill */}
            <View
              className="absolute flex-row items-center"
              style={{
                top: 12,
                left: 12,
                backgroundColor: '#a749ff',
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 4,
                gap: 6,
              }}
            >
              <Animated.View
                style={[
                  {
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: '#ffffff',
                  },
                  liveDotAnimatedStyle,
                ]}
              />
              <Text
                className="font-space-grotesk-bold text-white"
                style={{ fontSize: 10, letterSpacing: 1 }}
              >
                LIVE
              </Text>
            </View>

            {/* You-are-here dot — soft halo with a solid center */}
            <View
              className="absolute items-center justify-center"
              style={{
                top: 56,
                left: '50%',
                marginLeft: -16,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: 'rgba(167, 73, 255, 0.25)',
              }}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: '#a749ff',
                }}
              />
            </View>
          </View>

          {/* Card content below the map */}
          <View className="px-4 pb-4">
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

            {/* 3 stat tiles */}
            <View className="flex-row gap-2 mt-4">
              <StatTile label="DURATION" value={duration} />
              <StatTile label="BATTERY" value={`${battery}%`} />
              <StatTile label="DISTANCE" value={distance} />
            </View>

            {/* Running total */}
            <View className="flex-row items-center justify-between mt-4">
              <Text
                className="font-space-grotesk text-parle-desat-7"
                style={{ fontSize: 13 }}
              >
                Running total:
              </Text>
              <View className="items-end">
                <Text
                  className="font-space-grotesk-bold text-parle-dark"
                  style={{ fontSize: 20 }}
                >
                  ${runningTotal}
                </Text>
                <Text
                  className="font-space-mono text-parle-desat-7"
                  style={{ fontSize: 9 }}
                >
                  @ ${hourlyRate}/hr
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ---- Action tiles ---- */}
        <Animated.View
          className="flex-row gap-2 mx-6 mt-4"
          entering={FadeInUp.duration(ROW_ENTRY_MS)
            .delay(ACTIONS_DELAY)
            .easing(Easing.out(Easing.cubic))}
        >
          <ActionTile icon={<LockIcon />} label="Lock Car" />
          <ActionTile icon={<SunIcon />} label="Climate" />
          <ActionTile icon={<VolumeMaxIcon />} label="Horn" />
          <ActionTile icon={<ChatCircleDotsIcon />} label="Support" />
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
            Vehicle will auto-lock when you end your ride. Drive safe!
          </Text>
        </Animated.View>

        {/* ---- End Ride CTA ---- */}
        <Animated.View
          className="mx-6 mt-4"
          entering={FadeInUp.duration(ROW_ENTRY_MS)
            .delay(CTA_DELAY)
            .easing(Easing.out(Easing.cubic))}
        >
          <Pressable
            onPress={onEndRide}
            className="bg-parle-dark rounded-2xl items-center justify-center"
            style={{
              height: 52,
              boxShadow: '0 6px 12px rgba(29, 6, 51, 0.2)',
            }}
          >
            <Text
              className="font-space-grotesk-bold text-white"
              style={{ fontSize: 16 }}
            >
              End Ride
            </Text>
          </Pressable>
        </Animated.View>

        {/* ---- Report an issue ---- */}
        <Animated.View
          className="mt-3 items-center"
          entering={FadeInUp.duration(ROW_ENTRY_MS)
            .delay(REPORT_DELAY)
            .easing(Easing.out(Easing.cubic))}
        >
          <Pressable hitSlop={8}>
            <Text
              className="font-space-grotesk text-parle-accent text-center"
              style={{ fontSize: 12 }}
            >
              Report an issue
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ====================== Local helper components ====================== */

/** One of the three stats below the trip header (duration / battery / distance). */
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

/** One of the four quick-action tiles below the trip card. Display-only for now. */
function ActionTile({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Pressable
      className="flex-1 items-center justify-center bg-white border border-parle-desat-3 rounded-xl gap-1"
      style={{
        height: 72,
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
      }}
    >
      {icon}
      <Text
        className="font-space-grotesk-medium text-parle-desat-7"
        style={{ fontSize: 10 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
