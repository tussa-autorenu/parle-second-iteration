import { Image } from 'expo-image';
import { CircleCheck, X } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
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
const SPECS_DELAY = 200;
const FEATURES_DELAY = 250;
const CTA_DELAY = 300;

type Props = {
  vehicle: Vehicle | null;
  onBack: () => void;
  onStartRide: () => void;
};

/**
 * SCENE 3 — Vehicle Detail.
 *
 * Renders the live vehicle the renter selected (a public fleet row from
 * Supabase or a share-code vehicle from the backend) in the original
 * prototype's detail layout. No owner/fleet-management controls.
 *
 * Entry: image scales 0.5×→1.0× from center while the surrounding content
 * fades + slides up, staggered top to bottom around the image.
 */
export function VehicleDetailScene({ vehicle, onBack, onStartRide }: Props) {
  // Local guard so a frantic double-tap on the X doesn't fire the close
  // animation twice (which would call `onBack` twice and break state).
  const [isClosing, setIsClosing] = useState(false);

  const imageScale = useSharedValue(IMAGE_INITIAL_SCALE);
  const wrapperOpacity = useSharedValue(1);
  const wrapperTranslateY = useSharedValue(0);

  useEffect(() => {
    imageScale.value = withTiming(1, {
      duration: IMAGE_ENTRY_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [imageScale]);

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

  // Defensive — keeps the screen recoverable if we somehow arrive with no
  // selected vehicle.
  if (!vehicle) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
        <Text className="font-space-grotesk text-parle-desat-7 text-center">
          This vehicle is no longer available.
        </Text>
        <Pressable onPress={onBack} className="mt-4">
          <Text className="font-space-grotesk-bold text-parle-logo">
            ← Back to list
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const isShared = vehicle.source === 'shared';

  const subtitle = isShared
    ? 'Shared access'
    : vehicle.distanceMi == null
      ? `${vehicle.color}  ·  Nearby`
      : `${vehicle.color}  ·  ${vehicle.distanceMi.toFixed(1)} mi away`;

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
                {subtitle}
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
              {/* Features list (standard Tesla amenities; empty for shared). */}
              <View className="gap-2" style={{ width: 187 }}>
                <Text
                  className="font-space-grotesk-bold text-parle-dark"
                  style={{ fontSize: 16, letterSpacing: -0.32 }}
                >
                  {isShared ? 'Access' : 'Included Features'}
                </Text>
                {isShared ? (
                  <Text
                    className="font-space-grotesk text-parle-desat-7"
                    style={{ fontSize: 14, lineHeight: 18 }}
                  >
                    Shared with you via a direct access code.
                  </Text>
                ) : (
                  vehicle.features.map((feature) => (
                    <View key={feature} className="flex-row items-center gap-2">
                      <CircleCheck size={16} color="#911cff" strokeWidth={2} />
                      <Text
                        className="font-space-grotesk text-parle-desat-7"
                        style={{ fontSize: 14, lineHeight: 14 }}
                      >
                        {feature}
                      </Text>
                    </View>
                  ))
                )}
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
