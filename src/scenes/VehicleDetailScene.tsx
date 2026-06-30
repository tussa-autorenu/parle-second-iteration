import { Image } from 'expo-image';
import { CircleCheck, X } from 'lucide-react-native';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { getAvailableVehicleById } from '@/lib/fleetAvailableVehicles';
import type { Vehicle, VehicleColor } from '@/src/data/vehicles';

// Same image lookup as on the list card so the visual is continuous.
const TESLA_IMAGES: Record<VehicleColor, number> = {
  White: require('../../assets/tesla_white.png'),
  Red: require('../../assets/tesla_red.png'),
  Black: require('../../assets/tesla_black.png'),
};

const ownerAvatar = require('../../assets/avatar-owner.png');

// ---- Entry choreography (App-Store-style "image lands first, rest builds around") --
const IMAGE_ENTRY_MS = 400;
const IMAGE_INITIAL_SCALE = 0.5;

const CLOSE_DURATION_MS = 350;
const CLOSE_CONTENT_TRANSLATE = 16;

const CLOSE_ENTRY_MS = 200;

// Each row of detail content fades in + slides up, staggered top → bottom.
const ROW_ENTRY_MS = 300;
const TITLE_DELAY = 100;
const PRICE_DELAY = 150;
const SPECS_DELAY = 200;
const FEATURES_DELAY = 250;
const CTA_DELAY = 300;

// Total estimate factor — folds in tax + service fees so the 4-hour estimate
// reads as realistic ($24/hr × 4h × 1.21 ≈ $116).
const FOUR_HOUR_FEE_MULTIPLIER = 1.21;

type Props = {
  vehicleId: string | null;
  onBack: () => void;
  onStartRide: () => void;
};

/**
 * SCENE 3 — Vehicle Detail.
 *
 * Fetches the selected vehicle by id from Supabase and renders it in the
 * original prototype's detail layout (hero image, price card, spec tiles,
 * included features + owner card, "Unlock & Start Ride" CTA).
 *
 * Entry: image scales 0.5×→1.0× from center while the surrounding content
 * fades + slides up, staggered top to bottom around the image.
 */
export function VehicleDetailScene({ vehicleId, onBack, onStartRide }: Props) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Local guard so a frantic double-tap on the X doesn't fire the close
  // animation twice (which would call `onBack` twice and break state).
  const [isClosing, setIsClosing] = useState(false);

  const imageScale = useSharedValue(IMAGE_INITIAL_SCALE);
  const wrapperOpacity = useSharedValue(1);
  const wrapperTranslateY = useSharedValue(0);

  useEffect(() => {
    let active = true;

    if (!vehicleId) {
      setIsLoading(false);
      setLoadError('No vehicle selected.');
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    getAvailableVehicleById(vehicleId)
      .then((row) => {
        if (!active) return;
        setVehicle(row);
        if (!row) setLoadError('This vehicle is no longer available.');
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load vehicle.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [vehicleId]);

  useEffect(() => {
    imageScale.value = withTiming(1, {
      duration: IMAGE_ENTRY_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [imageScale, vehicle]);

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: imageScale.value }],
  }));

  const wrapperAnimatedStyle = useAnimatedStyle(() => ({
    opacity: wrapperOpacity.value,
    transform: [{ translateY: wrapperTranslateY.value }],
  }));

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);

    imageScale.value = withTiming(
      IMAGE_INITIAL_SCALE,
      { duration: CLOSE_DURATION_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        'worklet';
        if (finished) {
          runOnJS(onBack)();
        }
      }
    );

    wrapperOpacity.value = withTiming(0, {
      duration: CLOSE_DURATION_MS,
      easing: Easing.in(Easing.cubic),
    });
    wrapperTranslateY.value = withTiming(CLOSE_CONTENT_TRANSLATE, {
      duration: CLOSE_DURATION_MS,
      easing: Easing.in(Easing.cubic),
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-white px-6"
        edges={['top', 'bottom']}
      >
        <StatusBar style="dark" />
        <ActivityIndicator color="#911cff" />
        <Text
          className="font-space-grotesk text-parle-desat-7 mt-3"
          style={{ fontSize: 14 }}
        >
          Loading vehicle…
        </Text>
      </SafeAreaView>
    );
  }

  // Defensive — keeps the screen recoverable if the row is gone or errored.
  if (!vehicle) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
        <Text className="font-space-grotesk text-parle-desat-7 text-center">
          {loadError ?? 'No vehicle selected.'}
        </Text>
        <Pressable onPress={onBack} className="mt-4">
          <Text className="font-space-grotesk-bold text-parle-logo">
            ← Back to list
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const distanceLabel =
    vehicle.distanceMi == null
      ? 'Nearby'
      : `${vehicle.distanceMi.toFixed(1)} mi away`;

  const fourHourEstimate =
    vehicle.hourlyRate == null
      ? null
      : Math.round(vehicle.hourlyRate * 4 * FOUR_HOUR_FEE_MULTIPLIER);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <Animated.View className="flex-1 justify-end" style={wrapperAnimatedStyle}>
        {/* ---- Close (X) button — top-right ---- */}
        <Animated.View
          className="flex-row items-center justify-end px-6"
          entering={FadeIn.duration(CLOSE_ENTRY_MS)}
        >
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            className="bg-parle-desat-2 rounded-full p-2"
          >
            <X size={24} color="#1d0633" strokeWidth={2} />
          </Pressable>
        </Animated.View>

        {/* ---- Image hero ---- */}
        <View
          className="items-center justify-center overflow-hidden"
          style={{ height: 200, padding: 8, marginTop: 16 }}
        >
          <Animated.View
            style={[
              { width: 306, height: 306, mixBlendMode: 'multiply' },
              imageAnimatedStyle,
            ]}
          >
            <Image
              source={TESLA_IMAGES[vehicle.color]}
              contentFit="contain"
              style={{ width: '100%', height: '100%' }}
            />
          </Animated.View>
        </View>

        {/* ---- Details column ---- */}
        <View className="px-6 pt-6 pb-10 gap-6">
          <View className="gap-4">
            {/* Title + subtitle */}
            <Animated.View
              className="px-2 gap-1"
              entering={FadeInUp.duration(ROW_ENTRY_MS)
                .delay(TITLE_DELAY)
                .easing(Easing.out(Easing.cubic))}
            >
              <Text
                className="font-space-grotesk-bold text-parle-dark"
                style={{ fontSize: 26, letterSpacing: -0.52 }}
              >
                {vehicle.model}
              </Text>
              <Text
                className="font-space-grotesk text-parle-desat-7"
                style={{ fontSize: 16, lineHeight: 16 }}
              >
                {vehicle.color}  ·  {distanceLabel}
              </Text>
            </Animated.View>

            {/* Price card */}
            <Animated.View
              className="rounded-2xl border border-parle-desat-3 bg-parle-desat-0 flex-row items-center justify-between px-6"
              style={{ height: 56 }}
              entering={FadeInUp.duration(ROW_ENTRY_MS)
                .delay(PRICE_DELAY)
                .easing(Easing.out(Easing.cubic))}
            >
              <View className="flex-row items-center gap-1.5">
                <Text
                  className="font-space-grotesk-bold text-parle-dark"
                  style={{ fontSize: 24 }}
                >
                  {vehicle.hourlyRate == null ? '$--' : `$${vehicle.hourlyRate}`}
                </Text>
                <Text
                  className="font-space-mono text-parle-desat-7"
                  style={{ fontSize: 12 }}
                >
                  /hour
                </Text>
              </View>
              <Text
                className="font-space-mono text-parle-desat-7"
                style={{ fontSize: 12 }}
              >
                {fourHourEstimate == null
                  ? '4 hour Est: —'
                  : `4 hour Est: $${fourHourEstimate}`}
              </Text>
            </Animated.View>

            {/* Spec tiles row */}
            <Animated.View
              className="flex-row gap-3"
              entering={FadeInUp.duration(ROW_ENTRY_MS)
                .delay(SPECS_DELAY)
                .easing(Easing.out(Easing.cubic))}
            >
              <SpecTile
                value={vehicle.batteryPct == null ? '—' : `${vehicle.batteryPct}%`}
                label="Battery"
              />
              <SpecTile
                value={vehicle.rangeMi == null ? '—' : `${vehicle.rangeMi} mi`}
                label="Range"
              />
              <SpecTile value={`${vehicle.seats}`} label="Seats" />
            </Animated.View>

            {/* Features + Owner row */}
            <Animated.View
              className="flex-row items-center justify-between pt-4 pb-2 px-2"
              entering={FadeInUp.duration(ROW_ENTRY_MS)
                .delay(FEATURES_DELAY)
                .easing(Easing.out(Easing.cubic))}
            >
              {/* Features list */}
              <View className="gap-2" style={{ width: 187 }}>
                <Text
                  className="font-space-grotesk-bold text-parle-dark"
                  style={{ fontSize: 16, letterSpacing: -0.32 }}
                >
                  Included Features
                </Text>
                {vehicle.features.map((feature) => (
                  <View key={feature} className="flex-row items-center gap-2">
                    <CircleCheck size={16} color="#911cff" strokeWidth={2} />
                    <Text
                      className="font-space-grotesk text-parle-desat-7"
                      style={{ fontSize: 14, lineHeight: 14 }}
                    >
                      {feature}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Owner card */}
              <View className="items-center gap-2" style={{ width: 105 }}>
                <View
                  className="rounded-full overflow-hidden"
                  style={{ width: 64, height: 64 }}
                >
                  <Image
                    source={ownerAvatar}
                    contentFit="cover"
                    style={{ width: '100%', height: '100%' }}
                  />
                </View>
                <Text
                  className="font-space-grotesk-bold text-parle-desat-7 text-center"
                  style={{ fontSize: 16, lineHeight: 16 }}
                >
                  {vehicle.owner.name}
                </Text>
                <Text
                  className="font-space-grotesk text-parle-desat-7 text-center"
                  style={{ fontSize: 12, lineHeight: 16 }}
                >
                  {vehicle.owner.role}
                </Text>
              </View>
            </Animated.View>
          </View>

          {/* ---- CTA ---- */}
          <Animated.View
            entering={FadeInUp.duration(ROW_ENTRY_MS)
              .delay(CTA_DELAY)
              .easing(Easing.out(Easing.cubic))}
          >
            <Pressable
              onPress={onStartRide}
              className="bg-parle-logo rounded-2xl items-center justify-center"
              style={{
                height: 56,
                boxShadow: '0 6px 16px rgba(29, 6, 51, 0.3)',
              }}
            >
              <Text
                className="font-space-grotesk-bold text-white"
                style={{ fontSize: 17 }}
              >
                Unlock & Start Ride
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

/** Small reusable spec tile used in the 3-up row under the price card. */
function SpecTile({ value, label }: { value: string; label: string }) {
  return (
    <View
      className="flex-1 rounded-2xl border border-parle-desat-3 bg-parle-desat-0 items-center justify-center gap-1"
      style={{ padding: 16 }}
    >
      <Text
        className="font-space-grotesk-bold text-parle-dark text-center"
        style={{ fontSize: 18 }}
      >
        {value}
      </Text>
      <Text
        className="font-space-mono text-parle-desat-7 text-center"
        style={{ fontSize: 11 }}
      >
        {label}
      </Text>
    </View>
  );
}
