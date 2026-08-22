"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web Audio snippet player. An <audio> element can't truthfully play a 0.01s
 * clip; BufferSource.start(when, offset, duration) is sample-accurate.
 *
 * iOS notes, because they decide whether the game makes any sound at all:
 *
 * - An AudioContext defaults to the `ambient` audio session, which the ringer
 *   switch mutes and a screen lock stops. A phone handed round a table is very
 *   often on silent, so we declare `playback` instead (Safari 16.4+).
 * - WebKit only lets a context start from a user gesture, and only from the
 *   *synchronous* part of it — `await` first and the gesture is spent. `unlock`
 *   exists to be called at the top of a click handler, before any awaits.
 * - Backgrounding the tab, a phone call, or another app taking audio leaves the
 *   context `suspended`/`interrupted`. Nothing throws; `currentTime` simply
 *   stops advancing, so playback silently wedges. We resume on the way back.
 */

const VOLUME_KEY = "guessable:volume";

declare global {
  interface Navigator {
    audioSession?: { type: string };
  }
}

export interface PreviewPlayer {
  /**
   * Start the audio context from inside a user gesture. Safe to call often;
   * only the first call does work. Must run before the handler's first `await`.
   */
  unlock: () => void;
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
  /** Bumped by every play/stop, so a slow resume can't revive a stale clip. */
  const playTokenRef = useRef(0);

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
      // Tell iOS this is media playback, not incidental UI sound: plays through
      // the ringer switch and survives the screen locking.
      if (typeof navigator !== "undefined" && navigator.audioSession) {
        navigator.audioSession.type = "playback";
      }
      ctxRef.current = new AudioContext();
      gainRef.current = ctxRef.current.createGain();
      gainRef.current.connect(ctxRef.current.destination);
      // Square the slider value for a perceptually even volume ramp.
      gainRef.current.gain.value = volumeRef.current ** 2;
    }
    return ctxRef.current;
  }, []);

  const unlock = useCallback(() => {
    const ctx = ensureContext();
    if (ctx.state !== "running") void ctx.resume();
    // WebKit wants an actual sounding node inside the gesture before it treats
    // the context as user-started; one silent sample is enough.
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start(0);
  }, [ensureContext]);

  const stopSource = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    playTokenRef.current += 1;
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
      const token = playTokenRef.current;

      const duration = Math.min(seconds, buffer.duration);
      setClipSeconds(duration);
      setIsPlaying(true);
      setProgress(0);

      const start = () => {
        // A resume that landed after the user moved on must not make noise.
        if (token !== playTokenRef.current) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gainRef.current!);
        const startedAt = ctx.currentTime;
        source.start(0, 0, duration);
        sourceRef.current = source;

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
      };

      // Starting a source on a suspended context doesn't throw — it just never
      // advances, so wait for the resume rather than pretending to play.
      if (ctx.state === "running") start();
      else void ctx.resume().then(start, () => setIsPlaying(false));
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

  // Coming back from the app switcher, a call, or a lock screen leaves the
  // context parked. Nudge it so the next tap isn't a dud.
  useEffect(() => {
    const resume = () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "running" && ctx.state !== "closed") void ctx.resume();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") resume();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
    };
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      void ctxRef.current?.close();
    };
  }, []);

  return {
    unlock,
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
