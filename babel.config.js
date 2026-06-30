module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // `jsxImportSource: "nativewind"` rewrites JSX to NativeWind's runtime
      // so the `className` prop works on React Native primitives.
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Reanimated 4 uses a separate worklets package. The plugin must be
      // the LAST entry in this array — moving it breaks worklet detection.
      "react-native-worklets/plugin",
    ],
  };
};
