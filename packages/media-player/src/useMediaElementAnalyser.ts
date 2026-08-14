import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { captureOscilloscopeFrame } from "./OscilloscopeCanvas.js";

type MediaAnalyserGraph = {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
  trackKeyRef: { current: string | null | undefined };
  captureCurrentFrame: () => void;
};

const mediaAnalyserGraphs =
  new WeakMap<HTMLMediaElement, MediaAnalyserGraph>();

export type MediaElementAnalyserController = {
  analyser: AnalyserNode | null;
  ensureAnalyser: () => Promise<AnalyserNode | null>;
};

/*
 * One reusable Web Audio graph per persistent media element. The host still
 * owns source attachment (private Library audio vs public HLS/MSE). The hook
 * also releases the graph when its owning player unmounts.
 */
export function useMediaElementAnalyser(
  audioRef: RefObject<HTMLAudioElement | null>,
  trackKey: string | null | undefined,
): MediaElementAnalyserController {
  const trackKeyRef = useRef<string | null | undefined>(trackKey);
  trackKeyRef.current = trackKey;
  const attachedAudioRef = useRef<HTMLMediaElement | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const releaseAttachedGraph = useCallback(() => {
    const audio = attachedAudioRef.current;
    if (!audio) return;

    const graph = mediaAnalyserGraphs.get(audio);
    attachedAudioRef.current = null;
    if (!graph) return;

    audio.removeEventListener("pause", graph.captureCurrentFrame);
    audio.removeEventListener("ended", graph.captureCurrentFrame);
    graph.source.disconnect();
    graph.analyser.disconnect();
    mediaAnalyserGraphs.delete(audio);

    if (graph.context.state !== "closed") {
      void graph.context.close().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    return () => {
      releaseAttachedGraph();
    };
  }, [releaseAttachedGraph]);

  const ensureAnalyser = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return null;

    const existing = mediaAnalyserGraphs.get(audio);
    if (existing) {
      existing.trackKeyRef = trackKeyRef;
      attachedAudioRef.current = audio;

      if (existing.context.state === "suspended") {
        await existing.context.resume();
      }

      setAnalyser(existing.analyser);
      return existing.analyser;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
    if (!AudioContextConstructor) return null;

    const context = new AudioContextConstructor();
    const source = context.createMediaElementSource(audio);
    const nextAnalyser = context.createAnalyser();
    nextAnalyser.fftSize = 2048;
    nextAnalyser.smoothingTimeConstant = 0.72;
    source.connect(nextAnalyser);
    nextAnalyser.connect(context.destination);

    let graph: MediaAnalyserGraph;
    const captureCurrentFrame = () => {
      const key = graph.trackKeyRef.current;
      if (key) captureOscilloscopeFrame(key, graph.analyser);
    };

    graph = {
      context,
      source,
      analyser: nextAnalyser,
      trackKeyRef,
      captureCurrentFrame,
    };

    audio.addEventListener("pause", captureCurrentFrame);
    audio.addEventListener("ended", captureCurrentFrame);
    mediaAnalyserGraphs.set(audio, graph);
    attachedAudioRef.current = audio;
    setAnalyser(nextAnalyser);

    if (context.state === "suspended") {
      await context.resume();
    }

    return nextAnalyser;
  }, [audioRef]);

  return { analyser, ensureAnalyser };
}
