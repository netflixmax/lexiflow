import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { SharedIncomingPayload, VoiceConfig } from '../types';

export const APP_VERSION_NAME = '1.4.0';
export const APP_VERSION_CODE = 10400;

export const KOKORO_SPEAKERS: Array<{ id: number; name: string; desc: string }> = [
  { id: 3, name: 'Heart', desc: '美式温暖女声 · 推荐' },
  { id: 2, name: 'Bella', desc: '美式自然女声' },
  { id: 0, name: 'Alloy', desc: '美式清晰中性' },
  { id: 1, name: 'Aoede', desc: '美式柔和叙事' },
  { id: 4, name: 'Jessica', desc: '美式知性女声' },
  { id: 5, name: 'Kore', desc: '美式明亮清晰' },
  { id: 6, name: 'Nicole', desc: '美式轻柔耳语' },
  { id: 7, name: 'Nova', desc: '美式清澈播客' },
  { id: 8, name: 'River', desc: '美式沉稳中性' },
  { id: 9, name: 'Sarah', desc: '美式新闻质感' },
  { id: 10, name: 'Sky', desc: '美式轻快活力' },
];

interface NativeTtsPluginInterface {
  configure(options: {
    engine: string;
    kokoroSpeaker: number;
    rimeApiKey: string;
    rimeModel: string;
    rimeSpeaker: string;
  }): Promise<void>;
  getStatus(): Promise<{ kokoroBundled: boolean; cacheBytes: number }>;
  fetchRimeVoices(options: { model: string }): Promise<{ voices: string[] }>;
  clearCache(): Promise<{ cleared: boolean }>;
  speak(options: { text: string; rate?: number; utteranceId?: string }): Promise<{ utteranceId: string }>;
  speakSequence(options: {
    sentences: string[];
    startIndex: number;
    rate: number;
    loopSingle: boolean;
  }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'ttsDone' | 'ttsSentenceStart' | 'ttsSequenceDone',
    listenerFunc: (info: { utteranceId?: string; index?: number; completed?: boolean }) => void,
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

interface ShareReceiverPluginInterface {
  consumePendingShare(): Promise<{ hasPayload: boolean; payload?: SharedIncomingPayload }>;
  addListener(
    eventName: 'shareReceived',
    listenerFunc: (payload: SharedIncomingPayload) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeTtsPlugin = registerPlugin<NativeTtsPluginInterface>('NativeTts');
const AppUpdaterPlugin = registerPlugin<AppUpdaterPluginInterface>('AppUpdater');
const ShareReceiverPlugin = registerPlugin<ShareReceiverPluginInterface>('ShareReceiver');

export const isNativeAndroid = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

let seqListeners: PluginListenerHandle[] = [];
let webSeqAborted = false;

async function clearSeqListeners() {
  for (const h of seqListeners) {
    try {
      await h.remove();
    } catch {
      // ignore
    }
  }
  seqListeners = [];
}

export async function configureSpeechEngine(voice: VoiceConfig): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await NativeTtsPlugin.configure({
      engine: voice.engine,
      kokoroSpeaker: voice.kokoroSpeaker,
      rimeApiKey: voice.rimeApiKey,
      rimeModel: voice.rimeModel,
      rimeSpeaker: voice.rimeSpeaker,
    });
  } catch {
    // ignore
  }
}

export async function getSpeechStatus(): Promise<{ kokoroBundled: boolean; cacheBytes: number }> {
  if (!isNativeAndroid()) {
    return { kokoroBundled: false, cacheBytes: 0 };
  }
  try {
    return await NativeTtsPlugin.getStatus();
  } catch {
    return { kokoroBundled: false, cacheBytes: 0 };
  }
}

export async function fetchRimeVoices(model: 'coda' | 'mistv3'): Promise<string[]> {
  if (isNativeAndroid()) {
    try {
      const res = await NativeTtsPlugin.fetchRimeVoices({ model });
      if (res.voices?.length) return res.voices;
    } catch {
      // fallback
    }
  }
  try {
    const res = await fetch('https://users.rime.ai/data/voices/all-v2.json');
    if (res.ok) {
      const data = await res.json();
      const eng = data?.[model]?.eng;
      if (Array.isArray(eng) && eng.length > 0) return eng as string[];
    }
  } catch {
    // fallback
  }
  return ['astra', 'celeste', 'mesa', 'marsh', 'cove', 'orion'];
}

export async function clearSpeechCache(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await NativeTtsPlugin.clearCache();
    return Boolean(res.cleared);
  } catch {
    return false;
  }
}

export async function speakText(
  text: string,
  options: { rate?: number; locale?: 'en-US' | 'en-GB'; onEnd?: () => void } = {},
): Promise<void> {
  const rate = options.rate ?? 0.92;
  const locale = options.locale ?? 'en-US';

  if (isNativeAndroid()) {
    const utteranceId = `utt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let handle: PluginListenerHandle | null = null;
    if (options.onEnd) {
      handle = await NativeTtsPlugin.addListener('ttsDone', (info) => {
        if (info.utteranceId === utteranceId) {
          handle?.remove();
          options.onEnd?.();
        }
      });
    }
    await NativeTtsPlugin.speak({ text, rate, utteranceId });
    return;
  }

  // Web preview fallback
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = locale;
    utter.rate = rate;
    utter.onend = () => options.onEnd?.();
    utter.onerror = () => options.onEnd?.();
    window.speechSynthesis.speak(utter);
  } else {
    options.onEnd?.();
  }
}

/**
 * Play a sequence of sentences continuously using native Kokoro/Rime prefetching.
 */
export async function speakSequence(
  sentences: string[],
  options: {
    startIndex: number;
    rate: number;
    loopSingle: boolean;
    onSentenceStart: (index: number) => void;
    onComplete: () => void;
  },
): Promise<void> {
  await stopSpeaking();
  await clearSeqListeners();

  if (isNativeAndroid()) {
    const h1 = await NativeTtsPlugin.addListener('ttsSentenceStart', (info) => {
      if (typeof info.index === 'number') options.onSentenceStart(info.index);
    });
    const h2 = await NativeTtsPlugin.addListener('ttsSequenceDone', () => {
      clearSeqListeners();
      options.onComplete();
    });
    seqListeners = [h1, h2];
    await NativeTtsPlugin.speakSequence({
      sentences,
      startIndex: options.startIndex,
      rate: options.rate,
      loopSingle: options.loopSingle,
    });
    return;
  }

  // Web preview sequential fallback
  webSeqAborted = false;
  const playIdx = (idx: number) => {
    if (webSeqAborted || idx >= sentences.length) {
      if (!webSeqAborted) options.onComplete();
      return;
    }
    options.onSentenceStart(idx);
    speakText(sentences[idx], {
      rate: options.rate,
      onEnd: () => {
        if (webSeqAborted) return;
        playIdx(options.loopSingle ? idx : idx + 1);
      },
    });
  };
  playIdx(options.startIndex);
}

export async function stopSpeaking(): Promise<void> {
  webSeqAborted = true;
  await clearSeqListeners();
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

export async function consumePendingShare(): Promise<SharedIncomingPayload | null> {
  if (!isNativeAndroid()) return null;
  try {
    const res = await ShareReceiverPlugin.consumePendingShare();
    return res.hasPayload && res.payload ? res.payload : null;
  } catch {
    return null;
  }
}

export async function subscribeIncomingShare(
  onReceive: (payload: SharedIncomingPayload) => void,
): Promise<() => void> {
  if (!isNativeAndroid()) return () => {};
  try {
    const handle = await ShareReceiverPlugin.addListener('shareReceived', onReceive);
    return () => {
      handle.remove().catch(() => {});
    };
  } catch {
    return () => {};
  }
}
