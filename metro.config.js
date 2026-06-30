const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Wrap the Expo Metro config so Tailwind classes are compiled on every reload.
// `input` points at the global.css file that contains the @tailwind directives.
module.exports = withNativeWind(config, { input: "./global.css" });
