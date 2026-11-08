/**
 * Institutional Procedural Sound Effects & Radar Audio Engine
 *
 * Synthesizes high-fidelity audio chimes directly via Web Audio API.
 * Requires 0 network bandwidth, 0 external audio assets, and operates 100% offline.
 */

export type RadarChimeType =
  | "radar_ping"
  | "institutional_chime"
  | "cyber_blip"
  | "sonar_pulse"
  | "urgent_alarm";

export interface RadarAudioSettings {
  soundType: RadarChimeType;
  volume: number; // 0.0 to 1.0 (default 0.7)
  enabled: boolean; // default true
  chimeOnZoneEntry: boolean; // default true
}

export const RADAR_AUDIO_SETTINGS_STORAGE_KEY = "mochex:radar_audio_settings";

export const DEFAULT_RADAR_AUDIO_SETTINGS: RadarAudioSettings = {
  soundType: "radar_ping",
  volume: 0.7,
  enabled: true,
  chimeOnZoneEntry: true,
};

export interface RadarChimePreset {
  id: RadarChimeType;
  label: string;
  description: string;
}

export const RADAR_CHIME_PRESETS: RadarChimePreset[] = [
  {
    id: "radar_ping",
    label: "Radar Sonar Ping",
    description: "Harmonic high-frequency radar sweep with exponential acoustic decay",
  },
  {
    id: "institutional_chime",
    label: "Institutional Crystal Chime",
    description: "Crystalline dual-tone bell chime (A5 880Hz + E6 1318.5Hz)",
  },
  {
    id: "cyber_blip",
    label: "Cyber Terminal Blip",
    description: "Snappy futuristic double-pip confirmation tone",
  },
  {
    id: "sonar_pulse",
    label: "Deep Sonar Resonance",
    description: "Low-frequency nautical sonar pulse with extended harmonic trail",
  },
  {
    id: "urgent_alarm",
    label: "Urgent Mitigation Warning",
    description: "High-alert alternating dual pulse for immediate zone breach",
  },
];

/**
 * Retrieves the current audio configuration from localStorage, falling back to defaults.
 */
export function getRadarAudioSettings(): RadarAudioSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_RADAR_AUDIO_SETTINGS };
  }

  try {
    const raw = localStorage.getItem(RADAR_AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RADAR_AUDIO_SETTINGS };

    const parsed = JSON.parse(raw);
    const validSoundTypes: RadarChimeType[] = [
      "radar_ping",
      "institutional_chime",
      "cyber_blip",
      "sonar_pulse",
      "urgent_alarm",
    ];

    const soundType = validSoundTypes.includes(parsed.soundType)
      ? (parsed.soundType as RadarChimeType)
      : DEFAULT_RADAR_AUDIO_SETTINGS.soundType;

    const volume =
      typeof parsed.volume === "number" && !isNaN(parsed.volume)
        ? Math.max(0, Math.min(1, parsed.volume))
        : DEFAULT_RADAR_AUDIO_SETTINGS.volume;

    const enabled = typeof parsed.enabled === "boolean" ? parsed.enabled : true;
    const chimeOnZoneEntry =
      typeof parsed.chimeOnZoneEntry === "boolean" ? parsed.chimeOnZoneEntry : true;

    return { soundType, volume, enabled, chimeOnZoneEntry };
  } catch {
    return { ...DEFAULT_RADAR_AUDIO_SETTINGS };
  }
}

/**
 * Persists audio configuration to localStorage and dispatches a window event.
 */
export function saveRadarAudioSettings(settings: RadarAudioSettings): void {
  if (typeof window === "undefined") return;

  try {
    const clampedSettings: RadarAudioSettings = {
      ...settings,
      volume: Math.max(0, Math.min(1, settings.volume)),
    };
    localStorage.setItem(RADAR_AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(clampedSettings));
    window.dispatchEvent(
      new CustomEvent("mochex:radar-audio-settings-changed", {
        detail: clampedSettings,
      })
    );
  } catch {}
}

/**
 * Procedurally synthesizes and plays the specified chime using Web Audio API.
 * Respects volume and enabled settings.
 */
export function playRadarChime(customSettings?: Partial<RadarAudioSettings>): void {
  if (typeof window === "undefined") return;

  const current = getRadarAudioSettings();
  const settings: RadarAudioSettings = {
    ...current,
    ...(customSettings || {}),
  };

  if (!settings.enabled || settings.volume <= 0.001) {
    return;
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const vol = Math.max(0, Math.min(1, settings.volume));

    switch (settings.soundType) {
      case "radar_ping": {
        // High clean sine sweep with overtone
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(1180, now);
        osc1.frequency.exponentialRampToValueAtTime(1420, now + 0.04);
        osc1.frequency.exponentialRampToValueAtTime(1100, now + 0.45);

        gain1.gain.setValueAtTime(vol * 0.28, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

        // Overtone
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(2360, now);
        gain2.gain.setValueAtTime(vol * 0.07, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.56);
        osc2.start(now);
        osc2.stop(now + 0.36);

        setTimeout(() => ctx.close().catch(() => {}), 650);
        break;
      }

      case "institutional_chime": {
        // Dual-tone A5 (880Hz) and E6 (1318.5Hz) with A6 overtone
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(vol * 0.22, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(1318.5, now + 0.08);
        gain2.gain.setValueAtTime(0.001, now);
        gain2.gain.setValueAtTime(vol * 0.24, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.42);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.68);

        setTimeout(() => ctx.close().catch(() => {}), 750);
        break;
      }

      case "cyber_blip": {
        // Snappy double-pip (660Hz -> 990Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(660, now);
        gain1.gain.setValueAtTime(vol * 0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(990, now + 0.07);
        gain2.gain.setValueAtTime(0.001, now);
        gain2.gain.setValueAtTime(vol * 0.25, now + 0.07);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.07);
        osc2.start(now + 0.07);
        osc2.stop(now + 0.22);

        setTimeout(() => ctx.close().catch(() => {}), 300);
        break;
      }

      case "sonar_pulse": {
        // Deep resonance ping (380Hz -> 260Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(380, now);
        osc1.frequency.exponentialRampToValueAtTime(260, now + 0.7);

        gain1.gain.setValueAtTime(vol * 0.35, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.88);

        setTimeout(() => ctx.close().catch(() => {}), 950);
        break;
      }

      case "urgent_alarm": {
        // Alternating alert warning pulses (920Hz and 690Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sawtooth";
        osc1.frequency.setValueAtTime(920, now);
        gain1.gain.setValueAtTime(vol * 0.18, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sawtooth";
        osc2.frequency.setValueAtTime(690, now + 0.14);
        gain2.gain.setValueAtTime(0.001, now);
        gain2.gain.setValueAtTime(vol * 0.2, now + 0.14);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.13);
        osc2.start(now + 0.14);
        osc2.stop(now + 0.32);

        setTimeout(() => ctx.close().catch(() => {}), 400);
        break;
      }
    }
  } catch {
    // Autoplay restrictions or headless environment
  }
}
