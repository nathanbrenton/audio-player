export const WAVEFORM_COLOR_OPTIONS = [
  { value: "3band", label: "3Band" },
  { value: "rgb", label: "RGB" },
  { value: "blue", label: "Blue" },
  { value: "monochrome", label: "Monochrome" },
] as const;

export type WaveformColorMode =
  (typeof WAVEFORM_COLOR_OPTIONS)[number]["value"];

export type WaveformPeak = [
  minimum: number,
  maximum: number,
  low: number,
  mid: number,
  high: number,
];
