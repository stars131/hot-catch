import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

const execFileAsync = promisify(execFile);

export async function withTemporaryAudio<T>(
  sourceUrl: string,
  idempotencyKey: string,
  callback: (audio: { path: string; bytes: number; mimeType: "audio/mpeg" }) => Promise<T>,
): Promise<T> {
  await assertPublicHttpUrl(sourceUrl);
  const safeKey = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  const directory = path.join(
    env.MEDIA_TEMP_ROOT || path.join(tmpdir(), "startrace"),
    `${safeKey || "audio"}-${randomUUID()}`,
  );
  const sourcePath = path.join(directory, "source-media");
  const audioPath = path.join(directory, "audio.mp3");

  await mkdir(directory, { recursive: true });
  try {
    await downloadToFile(sourceUrl, sourcePath);
    try {
      await execFileAsync(
        "ffmpeg",
        ["-y", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audioPath],
        { windowsHide: true, timeout: 10 * 60 * 1000 },
      );
    } catch (error) {
      throw new AppError(
        "DEPENDENCY_UNAVAILABLE",
        "音频提取失败，请检查 ffmpeg 或媒体链接。",
        503,
        process.env.NODE_ENV === "production"
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
      );
    }
    const audioStat = await stat(audioPath);
    return await callback({ path: audioPath, bytes: audioStat.size, mimeType: "audio/mpeg" });
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function audioFileToDataUrl(filePath: string) {
  const contents = await readFile(filePath);
  if (contents.byteLength > 9.5 * 1024 * 1024) {
    throw new AppError(
      "VALIDATION_ERROR",
      "提取后的音频超过 Qwen-ASR 10 MB 同步输入限制，请缩短视频或改用异步文件转写。",
      422,
    );
  }
  return `data:audio/mpeg;base64,${contents.toString("base64")}`;
}

async function downloadToFile(url: string, targetPath: string) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) {
    throw new AppError("PROVIDER_ERROR", `媒体下载失败（HTTP ${response.status}）。`, 502);
  }
  const maxBytes = env.MEDIA_DOWNLOAD_MAX_MB * 1024 * 1024;
  const announcedSize = Number(response.headers.get("content-length") ?? 0);
  if (announcedSize > maxBytes) {
    throw new AppError("VALIDATION_ERROR", "媒体文件超过允许的临时下载大小。", 422);
  }

  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.byteLength;
      if (received > maxBytes) {
        callback(new AppError("VALIDATION_ERROR", "媒体文件超过允许的临时下载大小。", 422));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
    limiter,
    createWriteStream(targetPath),
  );
}

async function assertPublicHttpUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError("VALIDATION_ERROR", "媒体链接必须使用 HTTP 或 HTTPS。", 400);
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new AppError("VALIDATION_ERROR", "媒体链接不能指向本机或私有网络。", 400);
  }
}

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}
