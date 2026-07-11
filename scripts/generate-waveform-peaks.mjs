#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_PEAKS_PER_SECOND = 100;
const MAXIMUM_PEAKS_PER_SECOND = 1000;
const FFT_SIZE = 1024;
const NORMALIZATION_PERCENTILE = 95;

const FREQUENCY_BANDS = {
  low: [20, 250],
  mid: [250, 4000],
  high: [4000, 20000],
};

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/*
 * Parse the optional waveform resolution argument.
 * Keeping a default preserves the generator's original behavior.
 */
function parsePeaksPerSecond(value) {
  if (value === undefined) {
    return DEFAULT_PEAKS_PER_SECOND;
  }

  const peaksPerSecond = Number(value);

  if (
    !Number.isInteger(peaksPerSecond) ||
    peaksPerSecond < 1 ||
    peaksPerSecond > MAXIMUM_PEAKS_PER_SECOND
  ) {
    fail(
      "peaks per second must be an integer between " +
        `1 and ${MAXIMUM_PEAKS_PER_SECOND}`,
    );
  }

  return peaksPerSecond;
}

function readPcm24LE(buffer, offset) {
  let value =
    buffer[offset] |
    (buffer[offset + 1] << 8) |
    (buffer[offset + 2] << 16);

  if (value & 0x800000) {
    value |= 0xff000000;
  }

  return value / 8388608;
}

function parseWav(buffer) {
  if (buffer.length < 12) {
    fail("WAV file is too small");
  }

  if (buffer.toString("ascii", 0, 4) !== "RIFF") {
    fail("only little-endian RIFF WAV files are supported");
  }

  if (buffer.toString("ascii", 8, 12) !== "WAVE") {
    fail("file is not a valid WAVE container");
  }

  let format = null;
  let dataOffset = null;
  let dataSize = null;
  let offset = 12;

  // Walk through each RIFF chunk until fmt and data are found.
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;
    const chunkEnd = chunkDataOffset + chunkSize;

    if (chunkEnd > buffer.length) {
      fail(`invalid ${chunkId} chunk size`);
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        fail("invalid fmt chunk");
      }

      let audioFormat = buffer.readUInt16LE(chunkDataOffset);

      const channels = buffer.readUInt16LE(chunkDataOffset + 2);
      const sampleRate = buffer.readUInt32LE(chunkDataOffset + 4);
      const blockAlign = buffer.readUInt16LE(chunkDataOffset + 12);
      const bitsPerSample = buffer.readUInt16LE(chunkDataOffset + 14);

      // WAVE_FORMAT_EXTENSIBLE stores its actual format in the subformat GUID.
      if (audioFormat === 0xfffe) {
        if (chunkSize < 40) {
          fail("invalid WAVE_FORMAT_EXTENSIBLE fmt chunk");
        }

        audioFormat = buffer.readUInt16LE(chunkDataOffset + 24);
      }

      format = {
        audioFormat,
        channels,
        sampleRate,
        blockAlign,
        bitsPerSample,
      };
    }

    if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }

    // RIFF chunks are padded to an even-byte boundary.
    offset = chunkEnd + (chunkSize % 2);
  }

  if (!format) {
    fail("WAV file does not contain a fmt chunk");
  }

  if (dataOffset === null || dataSize === null) {
    fail("WAV file does not contain a data chunk");
  }

  const supportedPcm =
    format.audioFormat === 1 &&
    [16, 24, 32].includes(format.bitsPerSample);

  const supportedFloat =
    format.audioFormat === 3 &&
    format.bitsPerSample === 32;

  if (!supportedPcm && !supportedFloat) {
    fail(
      `unsupported WAV encoding: format=${format.audioFormat}, ` +
        `bits=${format.bitsPerSample}`,
    );
  }

  const bytesPerSample = format.bitsPerSample / 8;
  const expectedBlockAlign = format.channels * bytesPerSample;

  if (format.blockAlign !== expectedBlockAlign) {
    fail(
      `unsupported block alignment: expected ${expectedBlockAlign}, ` +
        `found ${format.blockAlign}`,
    );
  }

  const frameCount = Math.floor(dataSize / format.blockAlign);

  return {
    ...format,
    bytesPerSample,
    dataOffset,
    dataSize,
    frameCount,
  };
}

function readSample(buffer, offset, audioFormat, bitsPerSample) {
  if (audioFormat === 3 && bitsPerSample === 32) {
    const value = buffer.readFloatLE(offset);

    return Number.isFinite(value)
      ? Math.max(-1, Math.min(1, value))
      : 0;
  }

  switch (bitsPerSample) {
    case 16:
      return buffer.readInt16LE(offset) / 32768;

    case 24:
      return readPcm24LE(buffer, offset);

    case 32:
      return buffer.readInt32LE(offset) / 2147483648;

    default:
      fail(`unsupported sample size: ${bitsPerSample}`);
  }
}

function buildMonoSamples(buffer, wav) {
  const samples = new Float64Array(wav.frameCount);

  // Average all source channels into one analysis channel.
  for (let frameIndex = 0; frameIndex < wav.frameCount; frameIndex += 1) {
    const frameOffset =
      wav.dataOffset + frameIndex * wav.blockAlign;

    let monoSample = 0;

    for (let channel = 0; channel < wav.channels; channel += 1) {
      const sampleOffset =
        frameOffset + channel * wav.bytesPerSample;

      monoSample += readSample(
        buffer,
        sampleOffset,
        wav.audioFormat,
        wav.bitsPerSample,
      );
    }

    samples[frameIndex] = monoSample / wav.channels;
  }

  return samples;
}

function createHannWindow(size) {
  const window = new Float64Array(size);

  for (let index = 0; index < size; index += 1) {
    window[index] =
      0.5 -
      0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
  }

  return window;
}

function reverseBits(value, bitCount) {
  let reversed = 0;

  for (let bit = 0; bit < bitCount; bit += 1) {
    reversed = (reversed << 1) | (value & 1);
    value >>>= 1;
  }

  return reversed;
}

function fftRealMagnitude(samples) {
  const size = samples.length;
  const levels = Math.log2(size);

  if (!Number.isInteger(levels)) {
    fail("FFT size must be a power of two");
  }

  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);

  // Place samples into bit-reversed order for the iterative FFT.
  for (let index = 0; index < size; index += 1) {
    real[reverseBits(index, levels)] = samples[index];
  }

  // Iterative radix-2 Cooley-Tukey FFT.
  for (let blockSize = 2; blockSize <= size; blockSize *= 2) {
    const halfSize = blockSize / 2;
    const angleStep = (-2 * Math.PI) / blockSize;

    for (let blockStart = 0; blockStart < size; blockStart += blockSize) {
      for (let offset = 0; offset < halfSize; offset += 1) {
        const angle = angleStep * offset;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);

        const evenIndex = blockStart + offset;
        const oddIndex = evenIndex + halfSize;

        const oddReal =
          real[oddIndex] * cosine -
          imaginary[oddIndex] * sine;

        const oddImaginary =
          real[oddIndex] * sine +
          imaginary[oddIndex] * cosine;

        real[oddIndex] = real[evenIndex] - oddReal;
        imaginary[oddIndex] =
          imaginary[evenIndex] - oddImaginary;

        real[evenIndex] += oddReal;
        imaginary[evenIndex] += oddImaginary;
      }
    }
  }

  const binCount = size / 2 + 1;
  const magnitudes = new Float64Array(binCount);

  for (let bin = 0; bin < binCount; bin += 1) {
    magnitudes[bin] = Math.hypot(real[bin], imaginary[bin]);
  }

  return magnitudes;
}

function calculateBandEnergy(
  magnitudes,
  sampleRate,
  minimumFrequency,
  maximumFrequency,
) {
  const nyquist = sampleRate / 2;
  const cappedMaximum = Math.min(maximumFrequency, nyquist);
  const binWidth = sampleRate / FFT_SIZE;

  const firstBin = Math.max(
    1,
    Math.ceil(minimumFrequency / binWidth),
  );

  const finalBin = Math.min(
    magnitudes.length - 1,
    Math.floor(cappedMaximum / binWidth),
  );

  if (finalBin < firstBin) {
    return 0;
  }

  let energy = 0;
  let binCount = 0;

  for (let bin = firstBin; bin <= finalBin; bin += 1) {
    const magnitude = magnitudes[bin];

    // Mean squared magnitude prevents wider bands winning by bin count alone.
    energy += magnitude * magnitude;
    binCount += 1;
  }

  return binCount > 0 ? Math.sqrt(energy / binCount) : 0;
}

function percentile(values, requestedPercentile) {
  if (values.length === 0) {
    return 1;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const normalized = Math.max(
    0,
    Math.min(100, requestedPercentile),
  );

  const index = Math.min(
    sorted.length - 1,
    Math.floor((normalized / 100) * (sorted.length - 1)),
  );

  return sorted[index] > 0 ? sorted[index] : 1;
}

function compressEnergy(value, reference) {
  const normalized = Math.min(1, value / reference);

  // Square-root compression keeps quieter band activity visible.
  return Math.sqrt(normalized);
}

function generateAnalysis(
  samples,
  wav,
  peaksPerSecond,
) {
  const hopSize = Math.max(
    1,
    Math.round(wav.sampleRate / peaksPerSecond),
  );

  const bucketCount = Math.ceil(wav.frameCount / hopSize);
  const window = createHannWindow(FFT_SIZE);
  const rawBuckets = new Array(bucketCount);

  const lowValues = new Array(bucketCount);
  const midValues = new Array(bucketCount);
  const highValues = new Array(bucketCount);

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const firstFrame = bucketIndex * hopSize;
    const finalFrame = Math.min(
      firstFrame + hopSize,
      wav.frameCount,
    );

    let minimum = 1;
    let maximum = -1;

    // Calculate the waveform envelope for this 10 ms bucket.
    for (
      let frameIndex = firstFrame;
      frameIndex < finalFrame;
      frameIndex += 1
    ) {
      const sample = samples[frameIndex];

      if (sample < minimum) {
        minimum = sample;
      }

      if (sample > maximum) {
        maximum = sample;
      }
    }

    // Center a larger overlapping FFT window on the current bucket.
    const fftStart =
      firstFrame + Math.floor(hopSize / 2) - Math.floor(FFT_SIZE / 2);

    const fftInput = new Float64Array(FFT_SIZE);

    for (let index = 0; index < FFT_SIZE; index += 1) {
      const sourceIndex = fftStart + index;
      const sample =
        sourceIndex >= 0 && sourceIndex < samples.length
          ? samples[sourceIndex]
          : 0;

      fftInput[index] = sample * window[index];
    }

    const magnitudes = fftRealMagnitude(fftInput);

    const low = calculateBandEnergy(
      magnitudes,
      wav.sampleRate,
      FREQUENCY_BANDS.low[0],
      FREQUENCY_BANDS.low[1],
    );

    const mid = calculateBandEnergy(
      magnitudes,
      wav.sampleRate,
      FREQUENCY_BANDS.mid[0],
      FREQUENCY_BANDS.mid[1],
    );

    const high = calculateBandEnergy(
      magnitudes,
      wav.sampleRate,
      FREQUENCY_BANDS.high[0],
      FREQUENCY_BANDS.high[1],
    );

    rawBuckets[bucketIndex] = {
      min: minimum,
      max: maximum,
      low,
      mid,
      high,
    };

    lowValues[bucketIndex] = low;
    midValues[bucketIndex] = mid;
    highValues[bucketIndex] = high;
  }

  // Normalize each band against its own 95th-percentile reference.
  const lowReference = percentile(
    lowValues,
    NORMALIZATION_PERCENTILE,
  );

  const midReference = percentile(
    midValues,
    NORMALIZATION_PERCENTILE,
  );

  const highReference = percentile(
    highValues,
    NORMALIZATION_PERCENTILE,
  );

  const peaks = rawBuckets.map((bucket) => [
    Number(bucket.min.toFixed(6)),
    Number(bucket.max.toFixed(6)),
    Number(compressEnergy(bucket.low, lowReference).toFixed(6)),
    Number(compressEnergy(bucket.mid, midReference).toFixed(6)),
    Number(compressEnergy(bucket.high, highReference).toFixed(6)),
  ]);

  return {
    peaks,
    normalizationReferences: {
      low: Number(lowReference.toFixed(6)),
      mid: Number(midReference.toFixed(6)),
      high: Number(highReference.toFixed(6)),
    },
  };
}

if (
  process.argv.length < 3 ||
  process.argv.length > 4
) {
  fail(
    "usage: node scripts/generate-waveform-peaks.mjs " +
      "path/to/track-directory [peaks-per-second]",
  );
}

const trackDirectory = path.resolve(process.argv[2]);
const peaksPerSecond = parsePeaksPerSecond(
  process.argv[3],
);
const inputPath = path.join(trackDirectory, "audio-master.wav");
const outputPath = path.join(trackDirectory, "waveform-peaks.json");

if (!fs.existsSync(trackDirectory)) {
  fail(`track directory not found: ${trackDirectory}`);
}

if (!fs.statSync(trackDirectory).isDirectory()) {
  fail(`path is not a directory: ${trackDirectory}`);
}

if (!fs.existsSync(inputPath)) {
  fail(`audio master not found: ${inputPath}`);
}

console.log(`Input:  ${inputPath}`);
console.log(`Output: ${outputPath}`);
console.log("Analysis:");
console.log(`  Peaks per second: ${peaksPerSecond}`);
console.log(`  FFT size:         ${FFT_SIZE}`);
console.log(
  `  Low band:         ${FREQUENCY_BANDS.low[0]}-${FREQUENCY_BANDS.low[1]} Hz`,
);
console.log(
  `  Mid band:         ${FREQUENCY_BANDS.mid[0]}-${FREQUENCY_BANDS.mid[1]} Hz`,
);
console.log(
  `  High band:        ${FREQUENCY_BANDS.high[0]}-${FREQUENCY_BANDS.high[1]} Hz`,
);

const wavBuffer = fs.readFileSync(inputPath);
const wav = parseWav(wavBuffer);
const monoSamples = buildMonoSamples(wavBuffer, wav);
const generated = generateAnalysis(
  monoSamples,
  wav,
  peaksPerSecond,
);

const output = {
  version: 2,
  durationSeconds: Number(
    (wav.frameCount / wav.sampleRate).toFixed(6),
  ),
  sampleRate: wav.sampleRate,
  sourceChannels: wav.channels,
  waveformChannels: 1,
  bitsPerSample: wav.bitsPerSample,
  peaksPerSecond,
  analysis: {
    fftSize: FFT_SIZE,
    window: "hann",
    bandsHz: FREQUENCY_BANDS,
    peakFields: ["min", "max", "low", "mid", "high"],
    normalization: {
      method: "per-band-percentile",
      percentile: NORMALIZATION_PERCENTILE,
      compression: "square-root",
      references: generated.normalizationReferences,
    },
  },
  peakCount: generated.peaks.length,
  peaks: generated.peaks,
};

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(output)}\n`,
  "utf8",
);

console.log(`Duration: ${output.durationSeconds} seconds`);
console.log(`Peaks:    ${output.peakCount}`);
console.log(`Created:  ${outputPath}`);
