import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { WebReferenceProvider } from "@/lib/providers/types";

const probeSchema = z.object({
  channel: z.literal("web"),
  status: z.enum(["ok", "warn", "off", "error"]),
  active_backend: z.string().min(1).nullable(),
});

const AGENT_REACH_PROBE_TIMEOUT_MS = 15_000;
const AGENT_REACH_PROBE_CACHE_MS = 60_000;
const MAX_PROBE_OUTPUT_BYTES = 64 * 1024;
const MAX_READER_OUTPUT_BYTES = 1024 * 1024;

type AgentReachProbeRunner = () => Promise<string>;

export type AgentReachChannelAvailability =
  | { available: true; activeBackend: string }
  | {
      available: false;
      reason:
        | "AGENT_REACH_DISABLED"
        | "AGENT_REACH_UNAVAILABLE"
        | "AGENT_REACH_CHANNEL_UNAVAILABLE";
    };

let cachedProbe:
  | { expiresAt: number; value: AgentReachChannelAvailability }
  | undefined;

/**
 * 通过固定 Python 入口调用 Agent Reach 的渠道检查。命令、脚本和渠道均由应用写死，
 * 用户输入不会进入可执行参数，也不会触发 Agent Reach 的安装、配置或 Cookie 提取命令。
 */
export async function probeAgentReachWebChannel(options?: {
  enabled?: boolean;
  runner?: AgentReachProbeRunner;
}): Promise<AgentReachChannelAvailability> {
  const enabled = options?.enabled ?? env.AGENT_REACH_ENABLED === "1";
  if (!enabled) return { available: false, reason: "AGENT_REACH_DISABLED" };

  if (!options?.runner && cachedProbe && cachedProbe.expiresAt > Date.now()) {
    return cachedProbe.value;
  }

  let value: AgentReachChannelAvailability;
  try {
    const raw = await (options?.runner ?? runAgentReachProbe)();
    const parsed = probeSchema.parse(JSON.parse(raw));
    value =
      parsed.status === "ok" && parsed.active_backend
        ? { available: true, activeBackend: parsed.active_backend }
        : { available: false, reason: "AGENT_REACH_CHANNEL_UNAVAILABLE" };
  } catch {
    value = { available: false, reason: "AGENT_REACH_UNAVAILABLE" };
  }

  if (!options?.runner) {
    cachedProbe = { expiresAt: Date.now() + AGENT_REACH_PROBE_CACHE_MS, value };
  }
  return value;
}

export class AgentReachWebProvider implements WebReferenceProvider {
  readonly name = "agent_reach_web";

  constructor(private readonly activeBackend = "Jina Reader") {}

  async importUrl(url: string) {
    const source = new URL(url);
    if (source.protocol !== "http:" && source.protocol !== "https:") {
      throw new AppError("VALIDATION_ERROR", "Agent Reach 只接受 HTTP/HTTPS 网页。", 400);
    }

    const endpoint = new URL(`https://r.jina.ai/${source.toString()}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.PROVIDER_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          Accept: "text/plain",
          "User-Agent": "STARTRACE/0.1 Agent-Reach-Web",
        },
      });
      if (!response.ok) {
        throw new AppError(
          "PROVIDER_ERROR",
          `Agent Reach 网页后端请求失败（HTTP ${response.status}）。`,
          502,
        );
      }
      const limited = await readLimitedText(response, MAX_READER_OUTPUT_BYTES);
      const markdown = limited.text.trim();
      if (!markdown) {
        throw new AppError("PROVIDER_ERROR", "Agent Reach 网页后端未返回正文。", 502);
      }
      return {
        title: extractReaderTitle(markdown),
        markdown,
        metadata: {
          agentReachChannel: "web",
          activeBackend: this.activeBackend,
          truncated: limited.truncated,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError("PROVIDER_ERROR", "Agent Reach 网页后端请求超时。", 504);
      }
      throw new AppError("PROVIDER_ERROR", "Agent Reach 网页后端暂时不可用。", 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function runAgentReachProbe(): Promise<string> {
  const executable =
    process.platform === "win32" ? "python" : "/opt/agent-reach/bin/python";
  const script = path.join(process.cwd(), "scripts", "agent-reach-probe.py");

  return new Promise((resolve, reject) => {
    const child = spawn(executable, [script, "web"], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error("Agent Reach probe timed out")));
    }, AGENT_REACH_PROBE_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > MAX_PROBE_OUTPUT_BYTES) {
        child.kill();
        finish(() => reject(new Error("Agent Reach probe output exceeded limit")));
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, "utf8") > MAX_PROBE_OUTPUT_BYTES) {
        child.kill();
        finish(() => reject(new Error("Agent Reach probe error output exceeded limit")));
      }
    });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => {
      finish(() => {
        if (code === 0) resolve(stdout);
        else reject(new Error("Agent Reach probe failed"));
      });
    });
  });
}

async function readLimitedText(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: "", truncated: false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let output = "";
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - received;
    if (remaining <= 0) {
      truncated = true;
      await cancelReaderQuietly(reader);
      break;
    }
    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
    received += chunk.byteLength;
    output += decoder.decode(chunk, { stream: true });
    if (value.byteLength > remaining || received >= maxBytes) {
      truncated = true;
      await cancelReaderQuietly(reader);
      break;
    }
  }
  return { text: output + decoder.decode(), truncated };
}

async function cancelReaderQuietly(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    await reader.cancel();
  } catch {
    // 读取结果已经达到安全上限，取消错误不影响既有正文。
  }
}

function extractReaderTitle(markdown: string): string | undefined {
  const metadataTitle = markdown.match(/^Title:\s*(.+)$/im)?.[1]?.trim();
  if (metadataTitle) return metadataTitle.slice(0, 300);
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading ? heading.slice(0, 300) : undefined;
}
