import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import type { Vehicle, VehicleColor } from '@/src/data/vehicles';

// Map each exterior color to its imported PNG. `require` calls are inlined
// at bundle time so RN/Metro can resolve them statically.
const TESLA_IMAGES: Record<VehicleColor, number> = {
  White: require('../../assets/tesla_white.png'),
  Red: require('../../assets/tesla_red.png'),
  Black: require('../../assets/tesla_black.png'),
};

type Props = {
  vehicle: Vehicle;
  onPress: () => void;
};

/** Distance copy with a graceful fallback when the DB has no distance. */
function distanceLabel(distanceMi: number | null): string {
  if (distanceMi == null) return 'Nearby';
  if (distanceMi < 0.1) return '<0.1 mi away';
  return `${distanceMi.toFixed(1)} mi away`;
}

/**
 * One row in the Vehicle List. Whole card is tappable → opens the detail
 * scene for this vehicle. Visuals lifted exactly from Figma node 166:260
 * (card sub-nodes 301:653 / 301:654 / 301:670).
 */
export function VehicleCard({ vehicle, onPress }: Props) {
  const isShared = vehicle.source === 'shared';
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl border border-parle-desat-3 bg-white px-4 pt-4 pb-2"
      style={{
        // 0px 4px 8px rgba(0,0,0,0.04) from Figma's `drop-shadow-[…]`.
        boxShadow: '0 4px 8px rgba(0,0,0,0.04)',
      }}
    >
      {/* Top row: car image (left) — model / distance / battery (right) */}
      <View
        className="flex-row items-center justify-between"
        style={{ height: 96 }}
      >
        {/* Car image — 120×120 with `multiply` blend so the PNG's
            off-white background bakes into the card's white surface. */}
        <View
          style={{ width: 120, height: 120, mixBlendMode: 'multiply' }}
        >
          <Image
            source={TESLA_IMAGES[vehicle.color]}
            contentFit="contain"
            style={{ width: '100%', height: '100%' }}
          />
        </View>

        {/* Right side — model / distance / battery chip column (no pricing) */}
        <View
          className="flex-row items-start"
          style={{ width: 202 }}
        >
          <View className="gap-2" style={{ width: 202 }}>
            <View className="gap-0.5">
              <Text
                className="font-space-grotesk-bold text-parle-dark"
                style={{ fontSize: 18, letterSpacing: -0.5 }}
                numberOfLines={1}
              >
                {vehicle.model}
              </Text>
              <Text
                className="font-space-grotesk text-parle-desat-7"
                style={{ fontSize: 14 }}
              >
                {distanceLabel(vehicle.distanceMi)}
              </Text>
            </View>
            {/* Battery chip — green-tinted bg, success-green text */}
            {vehicle.batteryPct != null && (
              <View
                className="items-center justify-center rounded-md px-2 self-start"
                style={{
                  height: 24,
                  backgroundColor: 'rgba(68, 195, 152, 0.15)',
                }}
              >
                <Text
                  className="font-space-grotesk-medium text-parle-success"
                  style={{ fontSize: 12 }}
                >
                  {vehicle.batteryPct}%
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Bottom footer row: status (left) + "View details →" (right),
          separated from the card body by a top border. */}
      <View
        className="flex-row items-center justify-between border-t border-parle-desat-3"
        style={{ height: 48 }}
      >
        {isShared ? (
          <Text
            className="font-space-grotesk-medium text-parle-logo"
            style={{ fontSize: 13 }}
          >
            Shared access
          </Text>
        ) : (
          <Text
            className="font-space-grotesk-medium text-parle-success"
            style={{ fontSize: 13 }}
          >
            Available now
          </Text>
        )}
        <Text
          className="font-space-grotesk-medium text-parle-dark"
          style={{ fontSize: 13 }}
        >
          View details →
        </Text>
      </View>
    </Pressable>
  );
}
