"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web Audio snippet player. An <audio> element can't truthfully play a 0.01s
 * clip; BufferSource.start(when, offset, duration) is sample-accurate.
 */

const VOLUME_KEY = "guessable:volume";

export interface PreviewPlayer {
  /** Fetch + decode the round's audio. Resolves when playable. */
  load: (url: string) => Promise<void>;
  /** Play the first `seconds` of the clip (stops any current playback). */
  play: (seconds: number) => void;
  /** Play the whole preview. */
  playFull: () => void;
  stop: () => void;
  /** Drop the loaded buffer (new round / back to menu). */
  reset: () => void;
  setVolume: (v: number) => void;
  volume: number;
  isPlaying: boolean;
  /** 0..1 through the current clip. */
  progress: number;
  /** Length of the clip currently playing (or last played), in seconds. */
  clipSeconds: number;
  ready: boolean;
}

export function usePreviewPlayer(): PreviewPlayer {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [clipSeconds, setClipSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const [volume, setVolumeState] = useState(() => {
    if (typeof window === "undefined") return 0.8;
    const stored = Number.parseFloat(localStorage.getItem(VOLUME_KEY) ?? "");
    return Number.isFinite(stored) ? Math.min(Math.max(stored, 0), 1) : 0.8;
  });
  const volumeRef = useRef(volume);

  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      gainRef.current = ctxRef.current.createGain();
      gainRef.current.connect(ctxRef.current.destination);
      // Square the slider value for a perceptually even volume ramp.
      gainRef.current.gain.value = volumeRef.current ** 2;
    }
    return ctxRef.current;
  }, []);

  const stopSource = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      try {
        sourceRef.current.stop();
      } catch {
        // already stopped
      }
      sourceRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stopSource();
    setIsPlaying(false);
    setProgress(0);
  }, [stopSource]);

  const load = useCallback(
    async (url: string) => {
      stop();
      setReady(false);
      bufferRef.current = null;
      const ctx = ensureContext();
      const res = await fetch(url);
      if (!res.ok) throw new Error("Could not load audio");
      const data = await res.arrayBuffer();
      bufferRef.current = await ctx.decodeAudioData(data);
      setReady(true);
    },
    [ensureContext, stop]
  );

  const play = useCallback(
    (seconds: number) => {
      const ctx = ensureContext();
      const buffer = bufferRef.current;
      if (!buffer) return;
      stopSource();
      void ctx.resume();

      const duration = Math.min(seconds, buffer.duration);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainRef.current!);
      const startedAt = ctx.currentTime;
      source.start(0, 0, duration);
      sourceRef.current = source;
      setClipSeconds(duration);
      setIsPlaying(true);
      setProgress(0);

      const tick = () => {
        const elapsed = ctx.currentTime - startedAt;
        setProgress(Math.min(elapsed / duration, 1));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      source.onended = () => {
        cancelAnimationFrame(rafRef.current);
        sourceRef.current = null;
        setProgress(1);
        setIsPlaying(false);
      };
    },
    [ensureContext, stopSource]
  );

  const playFull = useCallback(() => {
    if (bufferRef.current) play(bufferRef.current.duration);
  }, [play]);

  const reset = useCallback(() => {
    stop();
    bufferRef.current = null;
    setReady(false);
    setClipSeconds(0);
  }, [stop]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(Math.max(v, 0), 1);
    volumeRef.current = clamped;
    setVolumeState(clamped);
    if (gainRef.current) gainRef.current.gain.value = clamped ** 2;
    try {
      localStorage.setItem(VOLUME_KEY, String(clamped));
    } catch {
      // storage unavailable (private mode) — volume just won't persist
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      void ctxRef.current?.close();
    };
  }, []);

  return {
    load,
    play,
    playFull,
    stop,
    reset,
    setVolume,
    volume,
    isPlaying,
    progress,
    clipSeconds,
    ready,
  };
}
