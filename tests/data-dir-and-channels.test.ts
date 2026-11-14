import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  resolveWritableDataDir,
  readJsonData,
  writeJsonData,
} from "../src/lib/storage/data-dir";
import { POST as notifyPost } from "../src/app/api/alerts/notify/route";

describe("Writable Data Dir & Notification Channels Resilience", () => {
  const originalEnvDir = process.env.MOCHEX_DATA_DIR;
  let tempTestDir = "";

  beforeEach(() => {
    tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), "mochex-test-dir-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnvDir === undefined) {
      delete process.env.MOCHEX_DATA_DIR;
    } else {
      process.env.MOCHEX_DATA_DIR = originalEnvDir;
    }
    try {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    } catch {}
  });

  it("uses MOCHEX_DATA_DIR override when set and persists JSON atomically", () => {
    process.env.MOCHEX_DATA_DIR = tempTestDir;
    expect(resolveWritableDataDir()).toBe(tempTestDir);

    const payload = { trader: { discordEnabled: true } };
    const written = writeJsonData("test-webhooks.json", payload, "test-suite");
    expect(written).toBe(true);
    expect(fs.existsSync(path.join(tempTestDir, "test-webhooks.json"))).toBe(true);

    const loaded = readJsonData("test-webhooks.json", {}, "test-suite");
    expect(loaded).toEqual(payload);
  });

  it("falls back from EACCES on /app/.data to os.tmpdir() without crashing", () => {
    delete process.env.MOCHEX_DATA_DIR;
    const realMkdirSync = fs.mkdirSync;
    const realAccessSync = fs.accessSync;

    vi.spyOn(fs, "mkdirSync").mockImplementation((target, opts) => {
      if (String(target).endsWith(`${path.sep}.data`)) {
        const err = new Error("EACCES: permission denied, mkdir '/app/.data'") as NodeJS.ErrnoException;
        err.code = "EACCES";
        throw err;
      }
      return realMkdirSync(target, opts);
    });

    vi.spyOn(fs, "accessSync").mockImplementation((target, mode) => {
      if (String(target).endsWith(`${path.sep}.data`)) {
        const err = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
        err.code = "EACCES";
        throw err;
      }
      return realAccessSync(target, mode);
    });

    const resolved = resolveWritableDataDir();
    expect(resolved).toBe(path.join(os.tmpdir(), "mochex-data"));
  });

  it("falls back to in-memory storage when no directory is writable and never throws", () => {
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => {
      const err = new Error("EROFS: read-only file system") as NodeJS.ErrnoException;
      err.code = "EROFS";
      throw err;
    });
    vi.spyOn(fs, "accessSync").mockImplementation(() => {
      const err = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
      err.code = "EACCES";
      throw err;
    });

    expect(resolveWritableDataDir()).toBeNull();
    const ok = writeJsonData("mem-only.json", { active: true }, "test-suite");
    expect(ok).toBe(false);
    expect(readJsonData("mem-only.json", {}, "test-suite")).toEqual({ active: true });
  });

  it("completes Discord test notification even when filesystem writes fail", async () => {
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => {
      const err = new Error("EACCES: permission denied, mkdir '/app/.data'") as NodeJS.ErrnoException;
      err.code = "EACCES";
      throw err;
    });
    vi.spyOn(fs, "accessSync").mockImplementation(() => {
      const err = new Error("EACCES") as NodeJS.ErrnoException;
      err.code = "EACCES";
      throw err;
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));

    const req = new NextRequest("http://localhost:3018/api/alerts/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "test",
        channel: "discord",
        config: {
          discordWebhookUrl: "https://discord.com/api/webhooks/1234567890/abcdef",
          discordEnabled: true,
        },
      }),
    });

    const res = await notifyPost(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("rejects Telegram test when user accidentally enters the Bot's own ID as Chat ID", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const req = new NextRequest("http://localhost:3018/api/alerts/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "test",
        channel: "telegram",
        config: {
          telegramBotToken: "9176321396:AAF6wiYQPhuLFLD-QzY1234567890",
          telegramChatId: "9176321396",
          telegramEnabled: true,
        },
      }),
    });

    const res = await notifyPost(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Bot's own ID");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("detects personal Telegram Chat ID from getUpdates non-bot messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          result: [
            {
              update_id: 1001,
              message: {
                from: { id: 555666777, is_bot: false, username: "ymatt" },
                chat: { id: 555666777, type: "private", username: "ymatt" },
                text: "/start",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const req = new NextRequest("http://localhost:3018/api/alerts/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "detect_telegram_chat",
        config: {
          telegramBotToken: "9176321396:AAF6wiYQPhuLFLD-QzY1234567890",
        },
      }),
    });

    const res = await notifyPost(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.chatId).toBe("555666777");
    expect(json.displayName).toBe("@ymatt");
  });
});
