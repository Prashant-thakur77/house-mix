import fs from "node:fs/promises";
import path from "node:path";
import type { Briefing, BriefingLine } from "@housemix/shared";
import { config } from "../config.ts";

/** Two Cloud TTS voices: A = show caller, B = floor lead. */
const VOICES: Record<"A" | "B", { languageCode: string; name: string }> = {
  A: { languageCode: "en-US", name: process.env.HM_TTS_VOICE_A ?? "en-US-Neural2-D" },
  B: { languageCode: "en-US", name: process.env.HM_TTS_VOICE_B ?? "en-US-Neural2-F" },
};
/** Reads the bitrate from the first MPEG audio frame header (Cloud TTS MP3 is constant bitrate). */
export function mp3Kbps(buf: Buffer): number {
  for (let i = 0; i + 3 < Math.min(buf.length, 8192); i++) {
    if (buf[i] === 0xff && (buf[i + 1]! & 0xe0) === 0xe0) {
      const version = (buf[i + 1]! >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
      const idx = buf[i + 2]! >> 4;
      const v1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
      const v2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
      const kbps = (version === 3 ? v1 : v2)[idx];
      if (kbps) return kbps;
    }
  }
  return 32;
}

export function audioPath(showId: string, version: number) {
  return path.join(config.dataDir, "audio", `${showId}_v${version}.mp3`);
}

let ttsState: { available: boolean; reason?: string } | undefined;
export function ttsStatus() {
  return ttsState ?? { available: false, reason: "Not checked yet." };
}

export async function synthesize(showId: string, version: number, lines: BriefingLine[]): Promise<{ lines: BriefingLine[]; audio: Briefing["audio"] }> {
  if (process.env.HM_TTS === "off") return { lines, audio: { available: false, reason: "Server audio is turned off (HM_TTS=off)." } };
  try {
    const { TextToSpeechClient } = await import("@google-cloud/text-to-speech");
    const client = new TextToSpeechClient(config.gcpProject ? { projectId: config.gcpProject } : {});
    const chunks: Buffer[] = [];
    let t = 0;
    const timed: BriefingLine[] = [];
    for (const line of lines) {
      const [res] = await client.synthesizeSpeech({
        input: { text: line.text },
        voice: VOICES[line.speaker],
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.04 },
      });
      const buf = Buffer.from(res.audioContent as Uint8Array);
      chunks.push(buf);
      const ms = Math.round((buf.length * 8) / mp3Kbps(buf));
      timed.push({ ...line, startMs: t, endMs: t + ms });
      t += ms;
    }
    const mp3 = Buffer.concat(chunks);
    const url = await storeAudio(showId, version, mp3);
    ttsState = { available: true };
    return { lines: timed, audio: { available: true, url, durationMs: t } };
  } catch (e) {
    const reason = (e as Error).message.split("\n")[0]!.slice(0, 240);
    ttsState = { available: false, reason };
    return { lines, audio: { available: false, reason: `Cloud Text-to-Speech is unavailable here: ${reason}` } };
  }
}

async function storeAudio(showId: string, version: number, mp3: Buffer): Promise<string> {
  if (config.audioBucket) {
    const { Storage } = await import("@google-cloud/storage");
    const file = new Storage().bucket(config.audioBucket).file(`briefings/${showId}_v${version}.mp3`);
    await file.save(mp3, { contentType: "audio/mpeg", resumable: false });
  } else {
    const f = audioPath(showId, version);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, mp3);
  }
  return `/shows/${showId}/briefing.mp3?v=${version}`;
}

export async function readAudio(showId: string, version: number): Promise<Buffer | undefined> {
  if (config.audioBucket) {
    const { Storage } = await import("@google-cloud/storage");
    const file = new Storage().bucket(config.audioBucket).file(`briefings/${showId}_v${version}.mp3`);
    const [exists] = await file.exists();
    return exists ? (await file.download())[0] : undefined;
  }
  try {
    return await fs.readFile(audioPath(showId, version));
  } catch {
    return undefined;
  }
}
