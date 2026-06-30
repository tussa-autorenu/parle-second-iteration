import { Image } from 'expo-image';
import { useEffect } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { ViewStyle } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// AnimatedSvg lets us drive the SVG's `width` / `height` *props* from a
// shared value, so react-native-svg re-rasterises the vector paths at the
// displayed size on every frame (crisp at any scale). This is faster than
// view-transform scaling for tiny SVGs and produces no blurring.
const AnimatedSvg = Animated.createAnimatedComponent(Svg);

// Path data inlined from `assets/Parle logo icon.svg`. Same as in
// `<ParleLogo />` but duplicated here so the loading scene can pass
// animated width/height directly to the SVG without an extra wrapper
// component.
const PARLE_VIEWBOX_W = 99;
const PARLE_VIEWBOX_H = 96;
const PARLE_PATH_LEG =
  'M50.7253 38.0805C53.0761 38.0806 54.3165 40.8704 52.7277 42.6142L28.5613 69.1637C27.5962 70.2242 27.0613 71.6071 27.0613 73.0411V91.9576C27.0609 94.1916 25.2529 95.9996 23.0189 96H8.22734C3.68095 95.9995 0 92.3173 0 87.7708V69.9324C0.000196151 66.5229 1.26572 63.2296 3.56431 60.6982L21.1065 41.3729L21.1196 41.3992C23.0442 39.2809 25.7705 38.0805 28.6251 38.0805H50.7253Z';
const PARLE_PATH_LOOP =
  'M84.064 0C91.9043 4.92223e-05 98.2589 6.35508 98.2593 14.1953V44.7966C98.2593 48.439 96.9033 51.9519 94.4494 54.6514L81.1972 69.248C78.9367 71.741 75.732 73.1629 72.3736 73.1629H51.5521C49.2014 73.1629 47.9744 70.3731 49.5497 68.6293L70.7592 45.2616C72.4254 43.4146 73.3559 41.0252 73.3561 38.5324V27.7457C73.3559 26.17 72.0765 24.9051 70.5136 24.9051H6.59987C4.31403 24.9046 3.11295 22.1909 4.64991 20.499L20.4859 3.06182C22.2555 1.11134 24.7619 2.18699e-06 27.397 0H84.064Z';

// ---- Scene duration ----------------------------------------------------
// `LOADING_DURATION_MS` is now *derived* (see below) so the scene cuts
// the instant the logo hits its maximum enlargement — no trailing
// white-cushion, no overlay fade. Both the background pan and the
// auto-advance to the Vehicle List anchor to this derived value.

// ---- Phase 1: Logo entry ----------------------------------------------
// Wait, then translate-up + fade-in.
const LOGO_ENTRY_DELAY_MS = 700;
const LOGO_ENTRY_DURATION_MS = 400;
const LOGO_ENTRY_TRANSLATE_Y = 24;
// Logo is at rest at t = 1100 ms.

// ---- Phase 2: Color morph (purple → white) ----------------------------
// Cross-fade between two overlaid logos.
const COLOR_MORPH_START_MS = LOGO_ENTRY_DELAY_MS + LOGO_ENTRY_DURATION_MS; // 1100
const COLOR_MORPH_DURATION_MS = 500;
// Morph done at t = 1600 ms.

// ---- Phase 3: Bouncy zoom (LAST HALF-SECOND, SCENE ENDS AT MAX SCALE) -
// The zoom is held back until the final half-second of the scene — short,
// sharp, punchy. The squash anticipates, then the logo explosively
// expands. As soon as the expand completes (logo at maximum enlargement)
// the scene cuts to the Vehicle List — no held-white cushion, no
// overlay fade, just a hard handoff while the screen is already
// dominated by the giant white "P".
const ZOOM_START_MS = 2500;
const ZOOM_SQUASH_DURATION_MS = 100;
const ZOOM_EXPAND_DURATION_MS = 275;

// Derived: total scene length = the moment the expand completes.
const LOADING_DURATION_MS =
  ZOOM_START_MS + ZOOM_SQUASH_DURATION_MS + ZOOM_EXPAND_DURATION_MS; // 3875

const ZOOM_SQUASH_SCALE = 0.88;
// 80× — large enough that the "P" mark's *filled* pixels cover the whole
// screen at peak scale. The simple bounding-box-fits math says ~9× covers
// the screen, but the P only fills its upper-left and has a big empty
// wedge in the bottom-right of the bounding box. To push that empty wedge
// off the right edge of the screen, we need ~scale 56+ — 80× gives margin
// so every screen corner maps to white pixels at the moment of the cut.
const LOGO_FINAL_SCALE = 80;

// ---- Layout ------------------------------------------------------------
const LOGO_OFFSET_ABOVE_CENTER = 64;
const LOGO_WIDTH = 99;
const LOGO_HEIGHT = 96;

// ---- Background image stretch -----------------------------------------
const BG_PIXEL_WIDTH = 1304;
const BG_PIXEL_HEIGHT = 1536;
const BG_ASPECT = BG_PIXEL_WIDTH / BG_PIXEL_HEIGHT; // ≈ 0.849
const BG_HORIZONTAL_STRETCH = 8.0;

const bkgLoader = require('../../assets/bkg-loader.png');

type Props = {
  onComplete: () => void;
};

/**
 * SCENE 1 — Loading.
 *
 * Choreography (all timings anchored to constants above):
 *   t=0           bg starts panning (linear, full duration)
 *   t=700–1100    purple logo translates up + fades in
 *   t=1100–1600   logo color morphs purple → white (cross-fade)
 *   t=1600–3800   white logo zooms 1× → 12× *and* a white overlay
 *                 fades in over the rest of the screen (cubic ease-in)
 *   t=3800–4000   solid-white cushion
 *   t=4000        onComplete fires → Vehicle List scene mounts
 *
 * The next scene fades + slides its contents up from below on mount, so
 * the two screens stitch together: the white logo "becomes" the white
 * vehicle-list background, which then reveals the list rising into view.
 */
export function LoadingScene({ onComplete }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Vertical: fill exactly. Horizontal: stretched non-proportionally to
  // give a long pan runway — the streaks just get longer.
  const bgRenderedHeight = screenHeight;
  const bgRenderedWidth =
    screenHeight * BG_ASPECT * BG_HORIZONTAL_STRETCH;
  const bgPanRange = Math.max(0, bgRenderedWidth - screenWidth);

  // ---- Shared values ---------------------------------------------------
  const bgTranslateX = useSharedValue(0);

  const logoOpacity = useSharedValue(0);
  const logoTranslateY = useSharedValue(LOGO_ENTRY_TRANSLATE_Y);
  const logoScale = useSharedValue(1);

  const purpleOpacity = useSharedValue(1);
  const whiteLogoOpacity = useSharedValue(0);

  useEffect(() => {
    // --- Phase 1: Logo entry (700 → 1100 ms) ---
    logoOpacity.value = withDelay(
      LOGO_ENTRY_DELAY_MS,
      withTiming(1, {
        duration: LOGO_ENTRY_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      })
    );
    logoTranslateY.value = withDelay(
      LOGO_ENTRY_DELAY_MS,
      withTiming(0, {
        duration: LOGO_ENTRY_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      })
    );

    // --- Phase 2: Color morph purple → white (1100 → 1600 ms) ---
    purpleOpacity.value = withDelay(
      COLOR_MORPH_START_MS,
      withTiming(0, {
        duration: COLOR_MORPH_DURATION_MS,
        easing: Easing.linear,
      })
    );
    whiteLogoOpacity.value = withDelay(
      COLOR_MORPH_START_MS,
      withTiming(1, {
        duration: COLOR_MORPH_DURATION_MS,
        easing: Easing.linear,
      })
    );

    // --- Phase 3: Bouncy zoom + white-out (3500 → 4000 ms) ---
    // Squash → explosive expand. Reanimated's `withSequence` runs the
    // animations back-to-back without us needing nested `setTimeout`s.
    logoScale.value = withDelay(
      ZOOM_START_MS,
      withSequence(
        // Squash uses ease-IN-out so the shrink has a soft start AND
        // a soft landing (bell curve through the squash motion).
        withTiming(ZOOM_SQUASH_SCALE, {
          duration: ZOOM_SQUASH_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
        }),
        // Expand uses ease-IN at the *quart* power (Easing.poly(4)) —
        // flatter slow start than cubic ("comes, comes, comes…") with a
        // sharper acceleration into the final scale.
        withTiming(LOGO_FINAL_SCALE, {
          duration: ZOOM_EXPAND_DURATION_MS,
          easing: Easing.in(Easing.poly(4)),
        })
      )
    );
    // --- Background pan (runs for the full scene length) ---
    bgTranslateX.value = withTiming(-bgPanRange, {
      duration: LOADING_DURATION_MS,
      easing: Easing.linear,
    });

    // --- Auto-advance ---
    const timer = setTimeout(onComplete, LOADING_DURATION_MS);
    return () => clearTimeout(timer);
  }, [
    bgPanRange,
    bgTranslateX,
    logoOpacity,
    logoScale,
    logoTranslateY,
    onComplete,
    purpleOpacity,
    whiteLogoOpacity,
  ]);

  // ---- Animated styles -------------------------------------------------
  const bgAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: bgTranslateX.value }],
  }));

  // Wrapper carries opacity + the entry translateY only. The wrapper
  // itself stays anchored at the resting-logo position — no
  // zoom-related transforms. The centering math lives one level deeper,
  // on the inner views, so the *wrapper* doesn't appear to move during
  // the zoom.
  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ translateY: logoTranslateY.value }],
  }));

  // Inner-view centering — moves each inner view's `left` / `top` by
  // half the SVG's size growth so the SVG (anchored at the inner view's
  // top-left) stays visually centered on the wrapper's center as it
  // expands outward. Same math as before, just applied here instead of
  // to the wrapper's transform.
  const svgInnerAnimatedStyle = useAnimatedStyle(() => ({
    left: (LOGO_WIDTH - LOGO_WIDTH * logoScale.value) / 2,
    top: (LOGO_HEIGHT - LOGO_HEIGHT * logoScale.value) / 2,
  }));

  // Animated SVG props — width/height grow with `logoScale.value`. Every
  // frame react-native-svg rasterises the paths to the new size, so the
  // mark stays vector-sharp at any zoom factor.
  const svgAnimatedProps = useAnimatedProps(() => ({
    width: LOGO_WIDTH * logoScale.value,
    height: LOGO_HEIGHT * logoScale.value,
  }));

  const purpleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: purpleOpacity.value,
  }));

  const whiteLogoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: whiteLogoOpacity.value,
  }));

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />

      {/* Background — fills the screen vertically, stretched wide so we
          have a long horizontal pan runway. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: bgRenderedWidth,
            height: bgRenderedHeight,
          },
          bgAnimatedStyle,
        ]}
      >
        <Image
          source={bkgLoader}
          contentFit="fill"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Inner-shadow vignette to darken the edges. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { boxShadow: 'inset 0 0 64px 32px rgba(0,0,0,0.8)' },
        ]}
      />

      {/* Logo — two overlaid SVG versions (purple + white) cross-fade
          to morph the color in place. Both use AnimatedSvg with animated
          width/height so the paths rasterise sharp at every scale. The
          wrapper stays at the resting position — each inner view's
          animated `left` / `top` is what keeps the SVG visually centered
          as it expands from 99×96 → 7920×7680. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top:
              (screenHeight - LOGO_HEIGHT) / 2 - LOGO_OFFSET_ABOVE_CENTER,
            left: (screenWidth - LOGO_WIDTH) / 2,
            width: LOGO_WIDTH,
            height: LOGO_HEIGHT,
            overflow: 'visible',
          },
          logoAnimatedStyle,
        ]}
      >
        {/* Purple version — visible at rest, fades out during morph. */}
        <Animated.View
          style={[
            // Cast via `unknown` because RN 0.81's `BlendMode` type omits
            // `'plus-lighter'` even though the iOS runtime supports it.
            ({
              position: 'absolute',
              mixBlendMode: 'plus-lighter',
            } as unknown) as ViewStyle,
            purpleAnimatedStyle,
            svgInnerAnimatedStyle,
          ]}
        >
          <AnimatedSvg
            animatedProps={svgAnimatedProps}
            viewBox={`0 0 ${PARLE_VIEWBOX_W} ${PARLE_VIEWBOX_H}`}
            fill="none"
          >
            <Path d={PARLE_PATH_LEG} fill="#911CFF" />
            <Path d={PARLE_PATH_LOOP} fill="#911CFF" />
          </AnimatedSvg>
        </Animated.View>

        {/* White version — fades in during morph, then carries through
            the zoom. No blend mode needed: white-on-anything is white. */}
        <Animated.View
          style={[
            { position: 'absolute' },
            whiteLogoAnimatedStyle,
            svgInnerAnimatedStyle,
          ]}
        >
          <AnimatedSvg
            animatedProps={svgAnimatedProps}
            viewBox={`0 0 ${PARLE_VIEWBOX_W} ${PARLE_VIEWBOX_H}`}
            fill="none"
          >
            <Path d={PARLE_PATH_LEG} fill="#ffffff" />
            <Path d={PARLE_PATH_LOOP} fill="#ffffff" />
          </AnimatedSvg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
