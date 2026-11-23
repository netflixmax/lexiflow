import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Volume2,
} from 'lucide-react';
import { AI_PROVIDER_PRESETS, testAiConnection } from '../services/aiTutor';
import {
  APP_VERSION_CODE,
  APP_VERSION_NAME,
  clearSpeechCache,
  downloadAndInstallApk,
  fetchRimeVoices,
  getCurrentAppVersion,
  getSpeechStatus,
  KOKORO_SPEAKERS,
} from '../services/nativeBridge';
import { exportAllDataJson, importAllDataJson } from '../services/storage';
import { checkForAppUpdate } from '../services/updater';
import type { AiConfig, AiProvider, ReaderSettings, UpdateConfig, UpdateInfo, UserStats } from '../types';

interface ProfileViewProps {
  stats: UserStats;
  vocabCount: number;
  aiConfig: AiConfig;
  updateConfig: UpdateConfig;
  readerSettings: ReaderSettings;
  onUpdateReaderSettings: (next: ReaderSettings) => void;
  onUpdateAiConfig: (next: AiConfig) => void;
  onUpdateUpdateConfig: (next: UpdateConfig) => void;
  onDataImported: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  stats,
  vocabCount,
  aiConfig,
  updateConfig,
  readerSettings,
  onUpdateReaderSettings,
  onUpdateAiConfig,
  onUpdateUpdateConfig,
  onDataImported,
}) => {
  const [appVer, setAppVer] = useState({ versionName: APP_VERSION_NAME, versionCode: APP_VERSION_CODE });

  // Voice engine panel state
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [speechStatus, setSpeechStatus] = useState<{ kokoroBundled: boolean; cacheBytes: number }>({
    kokoroBundled: true,
    cacheBytes: 0,
  });
  const [rimeVoices, setRimeVoices] = useState<string[]>([
    'astra',
    'celeste',
    'mesa',
    'marsh',
    'cove',
    'orion',
  ]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  // Updater state
  const [showUpdateSettings, setShowUpdateSettings] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [downloadPct, setDownloadPct] = useState(0);

  // Optional AI Tutor collapsible state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestMsg, setAiTestMsg] = useState<string | null>(null);

  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCurrentAppVersion().then(setAppVer);
    getSpeechStatus().then(setSpeechStatus);
  }, []);

  // Build 28-day activity heatmap
  const heatmapDays = useMemo(() => {
    const days: Array<{ key: string; score: number }> = [];
    const now = new Date();
    for (let i = 27; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const act = stats.daily[key];
      const score = act
        ? Math.min(4, Math.ceil((act.wordsRead / 250 + act.reviews / 8 + act.listeningMins / 5 + act.wordsMined / 3)))
        : 0;
      days.push({ key, score });
    }
    return days;
  }, [stats.daily]);

  const activeDaysCount = useMemo(
    () => Object.keys(stats.daily).length,
    [stats.daily],
  );

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateMsg(null);
    setUpdateInfo(null);
    try {
      const info = await checkForAppUpdate(updateConfig);
      if (info.versionCode > appVer.versionCode) {
        setUpdateInfo(info);
      } else {
        setUpdateMsg(`当前已是最新版本 v${appVer.versionName}`);
      }
    } catch (e) {
      setUpdateMsg((e as Error).message || '检查更新失败');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo) return;
    setDownloadingUpdate(true);
    setDownloadPct(0);
    setUpdateMsg('正在下载安装包…');
    try {
      await downloadAndInstallApk(updateInfo.apkUrl, {
        sha256: updateInfo.sha256,
        fileName: `LexiFlow-v${updateInfo.versionName}.apk`,
        onProgress: (pct, status) => {
          setDownloadPct(pct);
          if (status === 'verifying') setUpdateMsg('正在校验安装包完整性…');
          if (status === 'installing') setUpdateMsg('正在唤起系统安装器…');
        },
      });
    } catch (e) {
      setUpdateMsg(`更新失败：${(e as Error).message}`);
    } finally {
      setDownloadingUpdate(false);
    }
  };

  const handleTestAi = async () => {
    setTestingAi(true);
    setAiTestMsg(null);
    try {
      const res = await testAiConnection(aiConfig);
      setAiTestMsg(res);
    } catch (e) {
      setAiTestMsg((e as Error).message);
    } finally {
      setTestingAi(false);
    }
  };

  const handleExport = () => {
    const json = exportAllDataJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lexiflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const summary = importAllDataJson(text);
      alert(`恢复成功：${summary.libraryCount} 篇阅读材料，${summary.vocabCount} 个词库单词。`);
      onDataImported();
    } catch (err) {
      alert(`恢复失败：${(err as Error).message}`);
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const heatColors = ['bg-[#EFECE6]', 'bg-amber-200', 'bg-amber-400', 'bg-emerald-500', 'bg-emerald-700'];

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6]">
      <header className="pt-safe px-5 pb-3 bg-[#FAF9F6] border-b border-[#ECEAE4]">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1C1B18]">成长与设置</h1>
        <p className="text-[12px] text-[#78756E] mt-0.5">能力复利 · 应用更新 · 可选 AI 助教</p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 pb-24">
        {/* Long-term Capability Metrics */}
        <section className="bg-white rounded-2xl p-4 border border-[#ECEAE4]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-semibold text-[#1C1B18]">长期学习复利</h2>
            <span className="text-[11px] text-[#8E8A80]">累计活跃 {activeDaysCount} 天</span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center mb-4">
            <div className="p-2 rounded-xl bg-[#FAF9F6]">
              <div className="text-[18px] font-semibold text-[#1C1B18]">{stats.wordsReadTotal}</div>
              <div className="text-[10px] text-[#8E8A80]">精读字数</div>
            </div>
            <div className="p-2 rounded-xl bg-[#FAF9F6]">
              <div className="text-[18px] font-semibold text-[#1C1B18]">{stats.listeningMinutes}m</div>
              <div className="text-[10px] text-[#8E8A80]">精听时长</div>
            </div>
            <div className="p-2 rounded-xl bg-[#FAF9F6]">
              <div className="text-[18px] font-semibold text-[#1C1B18]">{vocabCount}</div>
              <div className="text-[10px] text-[#8E8A80]">个人词库</div>
            </div>
            <div className="p-2 rounded-xl bg-[#FAF9F6]">
              <div className="text-[18px] font-semibold text-[#1C1B18]">{stats.reviewsTotal}</div>
              <div className="text-[10px] text-[#8E8A80]">FSRS 复习</div>
            </div>
          </div>

          {/* 28-day Heatmap */}
          <div className="text-[11px] text-[#8E8A80] mb-1.5">近 28 天专注热力图</div>
          <div className="grid grid-cols-14 gap-1.5">
            {heatmapDays.map((d) => (
              <div
                key={d.key}
                title={d.key}
                className={`aspect-square rounded-[4px] ${heatColors[d.score]}`}
              />
            ))}
          </div>
        </section>

        {/* In-App Self-Updater */}
        <section className="bg-white rounded-2xl p-4 border border-[#ECEAE4] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-[#1C1B18] flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-[#57544D]" /> 应用内一键更新
              </h2>
              <p className="text-[12px] text-[#8E8A80] mt-0.5">当前版本 v{appVer.versionName}</p>
            </div>
            <button
              onClick={handleCheckUpdate}
              disabled={checkingUpdate || downloadingUpdate}
              className="h-9 px-3.5 rounded-xl bg-[#1C1B18] text-white text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              {checkingUpdate && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              检查更新
            </button>
          </div>

          {updateInfo && (
            <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-emerald-700">
                  发现新版本 v{updateInfo.versionName}
                </span>
                {updateInfo.publishedAt && (
                  <span className="text-[11px] text-[#8E8A80]">{updateInfo.publishedAt}</span>
                )}
              </div>
              <p className="text-[12px] text-[#57544D] whitespace-pre-wrap leading-relaxed">
                {updateInfo.releaseNotes}
              </p>

              {downloadingUpdate && (
                <div className="space-y-1">
                  <div className="h-2 w-full bg-[#E7E4DC] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1C1B18] transition-all"
                      style={{ width: `${downloadPct}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-[#78756E] text-right">{downloadPct}%</div>
                </div>
              )}

              <button
                onClick={handleInstallUpdate}
                disabled={downloadingUpdate}
                className="w-full h-10 rounded-xl bg-emerald-700 text-white text-[13px] font-medium flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                {downloadingUpdate ? '正在下载…' : '立即下载并安装更新'}
              </button>
            </div>
          )}

          {updateMsg && (
            <p className="text-[12px] text-[#6E6B64] bg-[#F5F3EE] px-3 py-2 rounded-lg">{updateMsg}</p>
          )}

          <button
            onClick={() => setShowUpdateSettings((v) => !v)}
            className="w-full pt-2 border-t border-[#F1EFEA] flex items-center justify-between text-[12px] text-[#78756E]"
          >
            <span>配置更新源（GitHub Release 或自定义 Manifest）</span>
            {showUpdateSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showUpdateSettings && (
            <div className="space-y-2.5 pt-1">
              <div>
                <label className="text-[11px] text-[#78756E] block mb-1">
                  GitHub 仓库（如 yourname/lexiflow）
                </label>
                <input
                  type="text"
                  value={updateConfig.githubRepo}
                  onChange={(e) =>
                    onUpdateUpdateConfig({ ...updateConfig, githubRepo: e.target.value })
                  }
                  placeholder="username/lexiflow"
                  className="w-full h-9 px-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] text-[13px]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#78756E] block mb-1">
                  或自定义 update.json 清单链接（优先使用）
                </label>
                <input
                  type="url"
                  value={updateConfig.manifestUrl}
                  onChange={(e) =>
                    onUpdateUpdateConfig({ ...updateConfig, manifestUrl: e.target.value })
                  }
                  placeholder="https://raw.githubusercontent.com/.../update.json"
                  className="w-full h-9 px-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] text-[13px]"
                />
              </div>
            </div>
          )}
        </section>

        {/* Voice Engine Card (Kokoro Offline + Rime Cloud) */}
        <section className="bg-white rounded-2xl p-4 border border-[#ECEAE4]">
          <button
            onClick={() => {
              setShowVoicePanel((v) => !v);
              getSpeechStatus().then(setSpeechStatus);
            }}
            className="w-full flex items-center justify-between text-left"
          >
            <div>
              <div className="text-[14px] font-semibold text-[#1C1B18] flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-emerald-700" /> 语音引擎（Kokoro 离线 / Rime 云端）
              </div>
              <p className="text-[12px] text-[#8E8A80] mt-0.5">
                当前：{readerSettings.voice.engine === 'rime' && readerSettings.voice.rimeApiKey
                  ? `Rime 云端 · ${readerSettings.voice.rimeModel} / ${readerSettings.voice.rimeSpeaker}`
                  : `Kokoro 离线神经网络 · ${KOKORO_SPEAKERS.find((s) => s.id === readerSettings.voice.kokoroSpeaker)?.name ?? 'Heart'}`}
              </p>
            </div>
            {showVoicePanel ? (
              <ChevronUp className="w-4 h-4 text-[#78756E]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#78756E]" />
            )}
          </button>

          {showVoicePanel && (
            <div className="mt-4 pt-3.5 border-t border-[#F1EFEA] space-y-3">
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#F3F1EB] rounded-xl">
                <button
                  onClick={() =>
                    onUpdateReaderSettings({
                      ...readerSettings,
                      voice: { ...readerSettings.voice, engine: 'kokoro' },
                    })
                  }
                  className={`py-2 rounded-lg text-[12px] font-medium ${
                    readerSettings.voice.engine === 'kokoro'
                      ? 'bg-white text-[#1C1B18] shadow-xs'
                      : 'text-[#6E6B64]'
                  }`}
                >
                  Kokoro 离线（免费）
                </button>
                <button
                  onClick={() =>
                    onUpdateReaderSettings({
                      ...readerSettings,
                      voice: { ...readerSettings.voice, engine: 'rime' },
                    })
                  }
                  className={`py-2 rounded-lg text-[12px] font-medium ${
                    readerSettings.voice.engine === 'rime'
                      ? 'bg-white text-[#1C1B18] shadow-xs'
                      : 'text-[#6E6B64]'
                  }`}
                >
                  Rime 云端 API
                </button>
              </div>

              {readerSettings.voice.engine === 'kokoro' ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-[#78756E]">
                    状态：{speechStatus.kokoroBundled ? '内置 Kokoro-82M 模型已就绪（完全离线免 Key）' : '预览模式（Android 正式包内置 Kokoro）'}
                  </div>
                  <select
                    value={readerSettings.voice.kokoroSpeaker}
                    onChange={(e) =>
                      onUpdateReaderSettings({
                        ...readerSettings,
                        voice: { ...readerSettings.voice, kokoroSpeaker: Number(e.target.value) },
                      })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] text-[13px]"
                  >
                    {KOKORO_SPEAKERS.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name} — {sp.desc}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[11px] text-[#78756E] block mb-1">
                      Rime API Key（SHA-256 本地缓存音频，断网自动回退 Kokoro）
                    </label>
                    <input
                      type="password"
                      value={readerSettings.voice.rimeApiKey}
                      onChange={(e) =>
                        onUpdateReaderSettings({
                          ...readerSettings,
                          voice: { ...readerSettings.voice, rimeApiKey: e.target.value },
                        })
                      }
                      placeholder="粘贴你的 Rime API Key…"
                      className="w-full h-9 px-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] text-[13px]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {(['coda', 'mistv3'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          onUpdateReaderSettings({
                            ...readerSettings,
                            voice: { ...readerSettings.voice, rimeModel: m },
                          });
                          setLoadingVoices(true);
                          fetchRimeVoices(m)
                            .then(setRimeVoices)
                            .finally(() => setLoadingVoices(false));
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[12px] border ${
                          readerSettings.voice.rimeModel === m
                            ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                            : 'bg-[#FAF9F6] text-[#57544D] border-[#E5E2DA]'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setLoadingVoices(true);
                        fetchRimeVoices(readerSettings.voice.rimeModel)
                          .then(setRimeVoices)
                          .finally(() => setLoadingVoices(false));
                      }}
                      className="ml-auto text-[11px] text-[#57544D] underline"
                    >
                      {loadingVoices ? '拉取中…' : '刷新音色'}
                    </button>
                  </div>
                  <select
                    value={readerSettings.voice.rimeSpeaker}
                    onChange={(e) =>
                      onUpdateReaderSettings({
                        ...readerSettings,
                        voice: { ...readerSettings.voice, rimeSpeaker: e.target.value },
                      })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] text-[13px]"
                  >
                    {rimeVoices.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between text-[11px] text-[#8E8A80] pt-1">
                    <span>
                      本地音频缓存：{(speechStatus.cacheBytes / (1024 * 1024)).toFixed(2)} MB
                    </span>
                    <button
                      onClick={async () => {
                        await clearSpeechCache();
                        setSpeechStatus((s) => ({ ...s, cacheBytes: 0 }));
                      }}
                      className="text-rose-600 underline"
                    >
                      清空缓存
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Optional Add-on: AI Tutor (BYOK) — Cleanly Collapsed */}
        <section className="bg-white rounded-2xl p-4 border border-[#ECEAE4]">
          <button
            onClick={() => setShowAiPanel((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <div>
              <div className="text-[14px] font-semibold text-[#1C1B18] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600" /> AI 助教（可选附加功能）
              </div>
              <p className="text-[12px] text-[#8E8A80] mt-0.5">
                {aiConfig.enabled && aiConfig.apiKey
                  ? `已启用 · ${AI_PROVIDER_PRESETS[aiConfig.provider].label}`
                  : '基础功能 100% 免费离线可用；按需配置 API Key 解锁长难句拆解与深度导读'}
              </p>
            </div>
            {showAiPanel ? <ChevronUp className="w-4 h-4 text-[#78756E]" /> : <ChevronDown className="w-4 h-4 text-[#78756E]" />}
          </button>

          {showAiPanel && (
            <div className="mt-4 pt-3.5 border-t border-[#F1EFEA] space-y-3">
              <label className="flex items-center justify-between text-[13px] text-[#1C1B18]">
                <span>启用 AI 语境精析 / 长难句拆解 / 深度导读</span>
                <input
                  type="checkbox"
                  checked={aiConfig.enabled}
                  onChange={(e) => onUpdateAiConfig({ ...aiConfig, enabled: e.target.checked })}
                  className="w-4 h-4 accent-[#1C1B18]"
                />
              </label>

              <div>
                <label className="text-[11px] text-[#78756E] block mb-1">模型服务商</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(AI_PROVIDER_PRESETS) as AiProvider[]).map((p) => (
                    <button
                      key={p}
                      onClick={() =>
                        onUpdateAiConfig({
                          ...aiConfig,
                          provider: p,
                          baseUrl: AI_PROVIDER_PRESETS[p].baseUrl,
                          model: AI_PROVIDER_PRESETS[p].defaultModel,
                        })
                      }
                      className={`py-2 px-2.5 rounded-lg text-[12px] border text-left ${
                        aiConfig.provider === p
                          ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                          : 'bg-[#FAF9F6] text-[#57544D] border-[#E5E2DA]'
                      }`}
                    >
                      {AI_PROVIDER_PRESETS[p].label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-[#78756E] block mb-1">API Key（仅保存在本机）</label>
                <input
                  type="password"
                  value={aiConfig.apiKey}
                  onChange={(e) => onUpdateAiConfig({ ...aiConfig, apiKey: e.target.value })}
                  placeholder="粘贴你的 API Key…"
                  className="w-full h-9 px-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[#78756E] block mb-1">模型名称</label>
                  <input
                    type="text"
                    value={aiConfig.model}
                    onChange={(e) => onUpdateAiConfig({ ...aiConfig, model: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] text-[12px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#78756E] block mb-1">Base URL</label>
                  <input
                    type="text"
                    value={aiConfig.baseUrl}
                    onChange={(e) => onUpdateAiConfig({ ...aiConfig, baseUrl: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] text-[12px]"
                  />
                </div>
              </div>

              <button
                onClick={handleTestAi}
                disabled={testingAi || !aiConfig.apiKey.trim()}
                className="w-full h-9 rounded-lg border border-[#1C1B18] text-[#1C1B18] text-[12px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                {testingAi && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                测试 AI 连接
              </button>

              {aiTestMsg && (
                <div className="text-[12px] text-[#57544D] bg-[#F5F3EE] p-2.5 rounded-lg flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{aiTestMsg}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Data Backup & Privacy */}
        <section className="bg-white rounded-2xl p-4 border border-[#ECEAE4] space-y-3">
          <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#1C1B18]">
            <ShieldCheck className="w-4 h-4 text-[#57544D]" /> 本地数据与备份
          </div>
          <p className="text-[12px] text-[#8E8A80]">
            所有词库、FSRS 记忆曲线与导入书籍均保存在本机，覆盖更新不会丢失。你也可以随时导出备份。
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleExport}
              className="h-10 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] text-[13px] font-medium text-[#1C1B18] flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" /> 导出备份 JSON
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="h-10 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] text-[13px] font-medium text-[#1C1B18] flex items-center justify-center gap-1.5"
            >
              <Upload className="w-4 h-4" /> 恢复备份
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </div>
        </section>
      </div>
    </div>
  );
};
