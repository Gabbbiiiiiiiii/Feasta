"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import type {FeastaNotification} from "./notification-types";

/** Sound is enabled by a user gesture to respect browser autoplay controls. */
export function useNotificationSound(role: string) {
  const audio = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    seen.current = null;
    return () => {void audio.current?.close(); audio.current = null;};
  }, [role]);
  const ring = useCallback(() => {
    const context = audio.current;
    if (!context || context.state !== "running") return;
    const start = context.currentTime;
    for (const [offset, frequency] of [[0, 880], [0.16, 1174.66]]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.5);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start + offset); oscillator.stop(start + offset + 0.55);
      oscillator.onended = () => {oscillator.disconnect(); gain.disconnect();};
    }
  }, []);
  const toggle = async () => {
    if (enabled) {await audio.current?.suspend(); setEnabled(false); return;}
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setEnabled(true); setUnavailable(false); ring();
    } catch {setUnavailable(true); setEnabled(false);}
  };
  const observe = useCallback((items: readonly FeastaNotification[]) => {
    const previous = seen.current;
    if (previous && items.some((item) => !item.isRead && !previous.has(item.id))) ring();
    seen.current = new Set([...(previous ?? []), ...items.map((item) => item.id)]);
  }, [ring]);
  return {enabled, unavailable, toggle, ring, observe};
}
