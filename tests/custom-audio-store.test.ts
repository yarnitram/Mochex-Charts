import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  validateAudioFile,
  convertAudioBlobToBase64,
  getStoredCustomSounds,
  getCustomSoundById,
  saveCustomSound,
  deleteCustomSound,
  CustomSoundAsset,
  MAX_CUSTOM_AUDIO_FILE_SIZE_BYTES,
  CUSTOM_AUDIO_STORAGE_KEY,
} from "../src/lib/audio/custom-audio-store";
import {
  getServerCustomSounds,
  saveServerCustomSound,
  deleteServerCustomSound,
} from "../src/lib/audio/server-custom-audio-store";
import {
  getRadarAudioSettings,
  saveRadarAudioSettings,
  playRadarChime,
  RadarAudioSettings,
} from "../src/lib/audio/sound-effects";

class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

describe("Custom Audio Store & Asset Persistence (DEC-147)", () => {
  beforeEach(() => {
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = new MockLocalStorage();
    (globalThis as any).window.dispatchEvent = vi.fn();
    vi.restoreAllMocks();
  });

  describe("File Validation (validateAudioFile)", () => {
    it("accepts valid .wav and .mp3 files under the 2.5MB limit", () => {
      const validWav = validateAudioFile({
        name: "alert-chime.wav",
        size: 500 * 1024,
        type: "audio/wav",
      });
      expect(validWav.valid).toBe(true);
      expect(validWav.error).toBeUndefined();

      const validMp3 = validateAudioFile({
        name: "bullish_entry.mp3",
        size: 1.2 * 1024 * 1024,
        type: "audio/mpeg",
      });
      expect(validMp3.valid).toBe(true);
    });

    it("accepts valid .ogg and .m4a audio formats", () => {
      const validOgg = validateAudioFile({
        name: "zone_breach.ogg",
        size: 300 * 1024,
        type: "audio/ogg",
      });
      expect(validOgg.valid).toBe(true);

      const validM4a = validateAudioFile({
        name: "chime.m4a",
        size: 800 * 1024,
        type: "audio/x-m4a",
      });
      expect(validM4a.valid).toBe(true);
    });

    it("rejects non-audio formats", () => {
      const invalidExe = validateAudioFile({
        name: "malware.exe",
        size: 1024,
        type: "application/octet-stream",
      });
      expect(invalidExe.valid).toBe(false);
      expect(invalidExe.error).toContain("Unsupported file format");

      const invalidTxt = validateAudioFile({
        name: "notes.txt",
        size: 2048,
        type: "text/plain",
      });
      expect(invalidTxt.valid).toBe(false);
    });

    it("rejects files exceeding the 2.5MB size limit", () => {
      const oversized = validateAudioFile({
        name: "giant_sound.mp3",
        size: MAX_CUSTOM_AUDIO_FILE_SIZE_BYTES + 1024,
        type: "audio/mp3",
      });
      expect(oversized.valid).toBe(false);
      expect(oversized.error).toContain("exceeds maximum allowed limit of 2.5 MB");
    });
  });

  describe("Client Storage (IndexedDB / LocalStorage Fallback)", () => {
    it("saves and retrieves custom sounds in descending order of createdAt", async () => {
      const sound1: CustomSoundAsset = {
        id: "sound-1",
        name: "Older Chime.wav",
        dataUrl: "data:audio/wav;base64,AAA1",
        fileType: "audio/wav",
        fileSize: 1024,
        createdAt: 1000,
      };

      const sound2: CustomSoundAsset = {
        id: "sound-2",
        name: "Newer Chime.mp3",
        dataUrl: "data:audio/mpeg;base64,BBB2",
        fileType: "audio/mpeg",
        fileSize: 2048,
        createdAt: 2000,
      };

      await saveCustomSound(sound1);
      await saveCustomSound(sound2);

      const retrieved = await getStoredCustomSounds();
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].id).toBe("sound-2");
      expect(retrieved[1].id).toBe("sound-1");
    });

    it("finds a custom sound by ID", async () => {
      const sound: CustomSoundAsset = {
        id: "target-sound-id",
        name: "Target Tone.wav",
        dataUrl: "data:audio/wav;base64,CCC3",
        fileType: "audio/wav",
        fileSize: 512,
        createdAt: 3000,
      };

      await saveCustomSound(sound);

      const found = await getCustomSoundById("target-sound-id");
      expect(found).not.toBeNull();
      expect(found?.name).toBe("Target Tone.wav");
      expect(found?.dataUrl).toBe("data:audio/wav;base64,CCC3");

      const notFound = await getCustomSoundById("non-existent-id");
      expect(notFound).toBeNull();
    });

    it("deletes a custom sound by ID", async () => {
      const sound: CustomSoundAsset = {
        id: "to-delete",
        name: "Delete Me.mp3",
        dataUrl: "data:audio/mpeg;base64,DDD4",
        fileType: "audio/mpeg",
        fileSize: 1000,
        createdAt: 4000,
      };

      await saveCustomSound(sound);
      expect(await getStoredCustomSounds()).toHaveLength(1);

      await deleteCustomSound("to-delete");
      expect(await getStoredCustomSounds()).toHaveLength(0);
    });
  });

  describe("Server-Side Custom Audio Cloud Persistence", () => {
    it("saves and retrieves custom sounds for users via atomic storage", async () => {
      const testAsset: CustomSoundAsset = {
        id: "cloud-sound-1",
        name: "Institutional Siren.mp3",
        dataUrl: "data:audio/mpeg;base64,EEE5",
        fileType: "audio/mpeg",
        fileSize: 4096,
        createdAt: Date.now(),
      };

      await saveServerCustomSound("test-trader-1", testAsset);
      const userSounds = await getServerCustomSounds("test-trader-1");

      expect(userSounds).toHaveLength(1);
      expect(userSounds[0].id).toBe("cloud-sound-1");
      expect(userSounds[0].name).toBe("Institutional Siren.mp3");

      await deleteServerCustomSound("test-trader-1", "cloud-sound-1");
      const emptySounds = await getServerCustomSounds("test-trader-1");
      expect(emptySounds).toHaveLength(0);
    });
  });

  describe("Integration with Radar Audio Engine", () => {
    it("persists custom sound type in getRadarAudioSettings and saveRadarAudioSettings", () => {
      const customSettings: RadarAudioSettings = {
        soundType: "custom:sound-xyz-123",
        customSoundId: "sound-xyz-123",
        customSoundName: "My Custom Tone.mp3",
        volume: 0.9,
        enabled: true,
        chimeOnZoneEntry: true,
      };

      saveRadarAudioSettings(customSettings);
      const retrieved = getRadarAudioSettings();

      expect(retrieved.soundType).toBe("custom:sound-xyz-123");
      expect(retrieved.customSoundId).toBe("sound-xyz-123");
      expect(retrieved.customSoundName).toBe("My Custom Tone.mp3");
      expect(retrieved.volume).toBe(0.9);
    });

    it("does not throw when playRadarChime is called with a custom sound in headless environment", () => {
      expect(() => {
        playRadarChime({
          soundType: "custom:sound-xyz-123",
          customSoundDataUrl: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
          volume: 0.75,
          enabled: true,
        });
      }).not.toThrow();
    });
  });
});
