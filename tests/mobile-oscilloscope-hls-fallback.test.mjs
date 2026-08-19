import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const surfaceSource = await readFile(
  new URL(
    "../../packages/media-player/src/MediaVisualizationSurface.tsx",
    import.meta.url,
  ),
  "utf8",
);

const oscilloscopeSource = await readFile(
  new URL(
    "../../packages/media-player/src/OscilloscopeCanvas.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("oscilloscope falls back to compact waveform data when analyser samples are unavailable", () => {
  assert.match(
    surfaceSource,
    /<OscilloscopeCanvas[\s\S]*?peaks=\{peaks\}[\s\S]*?peaksPerSecond=\{peaksPerSecond \?\? 100\}/,
  );

  assert.match(
    oscilloscopeSource,
    /function hasUsableAnalyserSignal\([\s\S]*?maximum - minimum > 3[\s\S]*?frequencyData\[index\] > 1/,
  );

  assert.match(
    oscilloscopeSource,
    /function fillWaveformCompatibilityFrame\([\s\S]*?currentTime \* peaksPerSecond[\s\S]*?lowerCenter[\s\S]*?upperCenter[\s\S]*?lowerEnvelope[\s\S]*?upperEnvelope[\s\S]*?Math\.sin\(phase\)[\s\S]*?Math\.sin\(phase \* 2\.03 \+ 0\.7\)[\s\S]*?peak\[2\][\s\S]*?peak\[3\][\s\S]*?peak\[4\]/,
  );
  assert.doesNotMatch(
    oscilloscopeSource,
    /index % 2 === 0[\s\S]*?peak\[0\][\s\S]*?: peak\[1\]/,
  );

  assert.match(
    oscilloscopeSource,
    /if \(!renderedLiveAnalyser\)[\s\S]*?fillWaveformCompatibilityFrame\([\s\S]*?audioRef\.current\?\.currentTime \?\? 0[\s\S]*?renderTrace\(/,
  );
});

test("waveform zoom controls use SVG icons rather than selectable plus/minus text", () => {
  assert.match(
    surfaceSource,
    /data-waveform-zoom-icon="increase"[\s\S]*?<path d="M12 5v14" \/>[\s\S]*?<path d="M5 12h14" \/>/,
  );
  assert.match(
    surfaceSource,
    /data-waveform-zoom-icon="decrease"[\s\S]*?<path d="M5 12h14" \/>/,
  );

  assert.doesNotMatch(
    surfaceSource,
    />\s*\+\s*<\/button>/,
  );
  assert.doesNotMatch(
    surfaceSource,
    />\s*−\s*<\/button>/,
  );
});
