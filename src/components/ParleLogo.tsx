import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

/**
 * The Parle "P" mark, inlined from `assets/Parle logo icon.svg`.
 *
 * Inlining (vs. shipping the .svg file through a transformer) keeps the
 * dependency footprint smaller for this single-file logo and lets us pass
 * blend modes as a prop. If we end up with many SVG assets, switch to
 * `react-native-svg-transformer` and import the .svg directly.
 *
 * The original SVG used `mix-blend-mode: plus-lighter` on the `<g>` so the
 * mark glows against the red/orange motion streaks of the loading
 * background. We re-apply that here at the wrapper View level — that's
 * where React Native expects the `mixBlendMode` style to live.
 */
/**
 * Broader CSS `mix-blend-mode` value type than React Native's built-in
 * `BlendMode`. RN 0.81's type defs don't include `'plus-lighter'` /
 * `'plus-darker'` yet, even though the iOS runtime supports them — the
 * Figma "Lighter Color" mode on this logo exports as `plus-lighter`, so
 * we accept it here and cast when applying the style below.
 */
type BlendModeValue =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'plus-lighter'
  | 'plus-darker';

type Props = {
  width?: number;
  height?: number;
  /** Fill color applied to both `<Path>` elements. Defaults to Parle purple. */
  fill?: string;
  /** Maps to CSS `mix-blend-mode` on the wrapping View. */
  blendMode?: BlendModeValue;
  style?: StyleProp<ViewStyle>;
};

export function ParleLogo({
  width = 99,
  height = 96,
  fill = '#911CFF',
  blendMode,
  style,
}: Props) {
  return (
    <View
      style={[
        blendMode ? ({ mixBlendMode: blendMode } as ViewStyle) : null,
        style,
      ]}
    >
      <Svg width={width} height={height} viewBox="0 0 99 96" fill="none">
        <G>
          <Path
            d="M50.7253 38.0805C53.0761 38.0806 54.3165 40.8704 52.7277 42.6142L28.5613 69.1637C27.5962 70.2242 27.0613 71.6071 27.0613 73.0411V91.9576C27.0609 94.1916 25.2529 95.9996 23.0189 96H8.22734C3.68095 95.9995 0 92.3173 0 87.7708V69.9324C0.000196151 66.5229 1.26572 63.2296 3.56431 60.6982L21.1065 41.3729L21.1196 41.3992C23.0442 39.2809 25.7705 38.0805 28.6251 38.0805H50.7253Z"
            fill={fill}
          />
          <Path
            d="M84.064 0C91.9043 4.92223e-05 98.2589 6.35508 98.2593 14.1953V44.7966C98.2593 48.439 96.9033 51.9519 94.4494 54.6514L81.1972 69.248C78.9367 71.741 75.732 73.1629 72.3736 73.1629H51.5521C49.2014 73.1629 47.9744 70.3731 49.5497 68.6293L70.7592 45.2616C72.4254 43.4146 73.3559 41.0252 73.3561 38.5324V27.7457C73.3559 26.17 72.0765 24.9051 70.5136 24.9051H6.59987C4.31403 24.9046 3.11295 22.1909 4.64991 20.499L20.4859 3.06182C22.2555 1.11134 24.7619 2.18699e-06 27.397 0H84.064Z"
            fill={fill}
          />
        </G>
      </Svg>
    </View>
  );
}
