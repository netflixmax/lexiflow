import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export const APP_VERSION_NAME = '1.0.0';
export const APP_VERSION_CODE = 10000;

interface NativeTtsPluginInterface {
  speak(options: { text: string; rate?: number; locale?: string; utteranceId?: string }): Promise<{ utteranceId: string }>;
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

/**
 * Speak English text using native Android TextToSpeech on Android,
 * or Web Speech API when previewing in a desktop browser.
 */
export async function speakText(
  text: string,
  options: { rate?: number; locale?: 'en-US' | 'en-GB'; onEnd?: () => void } = {},
): Promise<void> {
  const rate = options.rate ?? 0.95;
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
    await NativeTtsPlugin.speak({ text, rate, locale, utteranceId });
    return;
  }

  // Browser fallback
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

export async function stopSpeaking(): Promise<void> {
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
