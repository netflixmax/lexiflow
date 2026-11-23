import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export const APP_VERSION_NAME = '1.1.0';
export const APP_VERSION_CODE = 10100;

export interface DeviceVoice {
  name: string;
  locale: string;
  quality: number;
  isNetwork: boolean;
}

interface NativeTtsPluginInterface {
  getVoices(): Promise<{ voices: DeviceVoice[] }>;
  speak(options: {
    text: string;
    rate?: number;
    locale?: string;
    voiceName?: string;
    utteranceId?: string;
  }): Promise<{ utteranceId: string }>;
  stop(): Promise<void>;
  addListener(
    eventName: 'ttsDone' | 'ttsError',
    listenerFunc: (info: { utteranceId: string; error?: string }) => void,
  ): Promise<PluginListenerHandle>;
}

interface AppUpdaterPluginInterface {
  getAppVersion(): Promise<{ versionName: string; versionCode: number }>;
  downloadAndInstall(options: { url: string; sha256?: string; fileName?: string }): Promise<{ started: boolean }>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (info: { progress: number; downloadedBytes: number; totalBytes: number; status: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeTtsPlugin = registerPlugin<NativeTtsPluginInterface>('NativeTts');
const AppUpdaterPlugin = registerPlugin<AppUpdaterPluginInterface>('AppUpdater');

export const isNativeAndroid = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

let activeHtmlAudio: HTMLAudioElement | null = null;
let audioAbortToken = 0;

function splitForNeuralAudio(text: string, maxLen = 175): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return [clean];
  const parts: string[] = [];
  const clauses = clean.split(/(?<=[,;:\-—])\s+/);
  let buf = '';
  for (const c of clauses) {
    if ((buf + ' ' + c).trim().length <= maxLen) {
      buf = (buf + ' ' + c).trim();
    } else {
      if (buf) parts.push(buf);
      if (c.length <= maxLen) {
        buf = c;
      } else {
        // Split very long clause by words
        const words = c.split(' ');
        let wbuf = '';
        for (const w of words) {
          if ((wbuf + ' ' + w).trim().length <= maxLen) {
            wbuf = (wbuf + ' ' + w).trim();
          } else {
            if (wbuf) parts.push(wbuf);
            wbuf = w;
          }
        }
        buf = wbuf;
      }
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

async function playOnlineNeuralChunks(
  text: string,
  rate: number,
  locale: 'en-US' | 'en-GB',
  token: number,
): Promise<boolean> {
  const chunks = splitForNeuralAudio(text);
  const tl = locale === 'en-GB' ? 'en-GB' : 'en-US';

  for (const chunk of chunks) {
    if (token !== audioAbortToken) return true;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(chunk)}`;
    const ok = await new Promise<boolean>((resolve) => {
      const audio = new Audio(url);
      activeHtmlAudio = audio;
      audio.playbackRate = Math.max(0.65, Math.min(1.6, rate));
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      audio.play().catch(() => resolve(false));
    });
    if (!ok) return false;
  }
  return true;
}

export async function getAvailableVoices(): Promise<DeviceVoice[]> {
  if (isNativeAndroid()) {
    try {
      const res = await NativeTtsPlugin.getVoices();
      return res.voices ?? [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Speak English text with natural neural audio first (when enabled & online),
 * seamlessly falling back to the highest-quality on-device Android TTS voice.
 */
export async function speakText(
  text: string,
  options: {
    rate?: number;
    locale?: 'en-US' | 'en-GB';
    voiceMode?: 'neural_online' | 'device_best';
    voiceName?: string;
    onEnd?: () => void;
  } = {},
): Promise<void> {
  const rate = options.rate ?? 0.9;
  const locale = options.locale ?? 'en-US';
  const voiceMode = options.voiceMode ?? 'neural_online';

  await stopSpeaking();
  const myToken = ++audioAbortToken;

  if (voiceMode === 'neural_online' && navigator.onLine) {
    const played = await playOnlineNeuralChunks(text, rate, locale, myToken);
    if (myToken !== audioAbortToken) return;
    if (played) {
      options.onEnd?.();
      return;
    }
  }

  if (isNativeAndroid()) {
    const utteranceId = `utt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let handle: PluginListenerHandle | null = null;
    if (options.onEnd) {
      handle = await NativeTtsPlugin.addListener('ttsDone', (info) => {
        if (info.utteranceId === utteranceId) {
          handle?.remove();
          if (myToken === audioAbortToken) {
            options.onEnd?.();
          }
        }
      });
    }
    await NativeTtsPlugin.speak({
      text,
      rate,
      locale,
      voiceName: options.voiceName || '',
      utteranceId,
    });
    return;
  }

  // Browser fallback
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = locale;
    utter.rate = rate;
    utter.onend = () => {
      if (myToken === audioAbortToken) options.onEnd?.();
    };
    utter.onerror = () => {
      if (myToken === audioAbortToken) options.onEnd?.();
    };
    window.speechSynthesis.speak(utter);
  } else {
    options.onEnd?.();
  }
}

export async function stopSpeaking(): Promise<void> {
  audioAbortToken++;
  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.src = '';
    } catch {
      // ignore
    }
    activeHtmlAudio = null;
  }
  if (isNativeAndroid()) {
    try {
      await NativeTtsPlugin.stop();
    } catch {
      // ignore
    }
    return;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export async function getCurrentAppVersion(): Promise<{ versionName: string; versionCode: number }> {
  if (isNativeAndroid()) {
    try {
      return await AppUpdaterPlugin.getAppVersion();
    } catch {
      return { versionName: APP_VERSION_NAME, versionCode: APP_VERSION_CODE };
    }
  }
  return { versionName: APP_VERSION_NAME, versionCode: APP_VERSION_CODE };
}

export async function downloadAndInstallApk(
  url: string,
  options: {
    sha256?: string;
    fileName?: string;
    onProgress?: (progress: number, status: string) => void;
  } = {},
): Promise<void> {
  if (!isNativeAndroid()) {
    window.open(url, '_blank');
    return;
  }

  let handle: PluginListenerHandle | null = null;
  if (options.onProgress) {
    handle = await AppUpdaterPlugin.addListener('downloadProgress', (info) => {
      options.onProgress?.(info.progress, info.status);
      if (info.status === 'installing' || info.status === 'error') {
        handle?.remove();
      }
    });
  }

  try {
    await AppUpdaterPlugin.downloadAndInstall({
      url,
      sha256: options.sha256,
      fileName: options.fileName ?? 'LexiFlow-update.apk',
    });
  } catch (err) {
    handle?.remove();
    throw err;
  }
}
