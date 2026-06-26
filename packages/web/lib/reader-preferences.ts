const MIN_BRIGHTNESS = 82;
const MAX_BRIGHTNESS = 108;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getAutoBrightnessPercent(now = new Date()) {
  const hour = now.getHours();

  if (hour >= 22 || hour < 6) {
    return 88;
  }

  if (hour < 9) {
    return 94;
  }

  if (hour >= 18) {
    return 92;
  }

  return 100;
}

export function getEffectiveBrightnessPercent(
  pageBrightness: number,
  autoBrightness: boolean,
  now = new Date(),
) {
  const manualBrightness = clamp(
    Math.round(pageBrightness),
    MIN_BRIGHTNESS,
    MAX_BRIGHTNESS,
  );

  if (!autoBrightness) {
    return manualBrightness;
  }

  return Math.min(manualBrightness, getAutoBrightnessPercent(now));
}
