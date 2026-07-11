#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const PEAKS_PER_SECOND = 100;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
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

      /*
       * WAVE_FORMAT_EXTENSIBLE stores the actual encoding identifier
       * inside the subformat GUID.
       */
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

    /*
     * RIFF chunks are padded to an even byte boundary.
     */
    offset = chunkEnd + (chunkSize % 2);
  }

  if (!format) {
    fail("WAV file does not contain a fmt chunk");
  }

  if (dataOffset === null || dataSize === null) {
    fail("WAV file does not contain a data chunk");
  }

  if (format.channels < 1) {
    fail("WAV file contains no audio channels");
  }

  if (format.sampleRate < 1) {
    fail("WAV file has an invalid sample rate");
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
    return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
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

function generatePeaks(buffer, wav) {
  const framesPerPeak = Math.max(
    1,
    Math.floor(wav.sampleRate / PEAKS_PER_SECOND),
  );

  const peakCount = Math.ceil(wav.frameCount / framesPerPeak);
  const peaks = new Array(peakCount);

  for (let peakIndex = 0; peakIndex < peakCount; peakIndex += 1) {
    const firstFrame = peakIndex * framesPerPeak;
    const finalFrame = Math.min(
      firstFrame + framesPerPeak,
      wav.frameCount,
    );

    let minimum = 1;
    let maximum = -1;

    for (let frameIndex = firstFrame; frameIndex < finalFrame; frameIndex += 1) {
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

      monoSample /= wav.channels;

      if (monoSample < minimum) {
        minimum = monoSample;
      }

      if (monoSample > maximum) {
        maximum = monoSample;
      }
    }

    peaks[peakIndex] = [
      Number(minimum.toFixed(6)),
      Number(maximum.toFixed(6)),
    ];
  }

  return peaks;
}

if (process.argv.length !== 3) {
  fail("usage: node scripts/generate-waveform-peaks.mjs path/to/track-directory");
}

const trackDirectory = path.resolve(process.argv[2]);
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

const wavBuffer = fs.readFileSync(inputPath);
const wav = parseWav(wavBuffer);
const peaks = generatePeaks(wavBuffer, wav);

const output = {
  version: 1,
  durationSeconds: Number(
    (wav.frameCount / wav.sampleRate).toFixed(6),
  ),
  sampleRate: wav.sampleRate,
  sourceChannels: wav.channels,
  waveformChannels: 1,
  bitsPerSample: wav.bitsPerSample,
  peaksPerSecond: PEAKS_PER_SECOND,
  peakCount: peaks.length,
  peaks,
};

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(output)}\n`,
  "utf8",
);

console.log(`Duration: ${output.durationSeconds} seconds`);
console.log(`Peaks:    ${output.peakCount}`);
console.log(`Created:  ${outputPath}`);
