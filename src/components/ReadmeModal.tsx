import React from 'react';
import { BookOpen, Database, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react';

interface ReadmeModalProps {
  onClose: () => void;
  onTriggerImport: () => void;
}

export const ReadmeModal: React.FC<ReadmeModalProps> = ({ onClose, onTriggerImport }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg bg-[#FAF9F6] rounded-t-3xl sm:rounded-3xl max-h-[86vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-[#ECEAE4] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-[#1C1B18] text-[#FAF9F6] flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5" />
            </span>
            <div>
              <h2 className="text-[16px] font-semibold text-[#1C1B18]">README · 这个系统怎么随你进化</h2>
              <p className="text-[11px] text-[#78756E]">极简个人操作系统说明书（v1.4）</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#EFECE6] flex items-center justify-center text-[#57544D]"
            aria-label="关闭说明书"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-[13px] leading-relaxed text-[#3D3A34]">
          {/* Core Philosophy */}
          <section className="p-4 rounded-2xl bg-white border border-[#ECEAE4] space-y-2">
            <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#1C1B18]">
              <Sparkles className="w-4 h-4 text-amber-600" />
              1. 为什么做减法（底层逻辑）
            </div>
            <p>
              这个软件不是传统英语教材库，而是你<strong>「认识自己 → 更新自己 → 线上打通线下」</strong>的每日出口。
            </p>
            <p className="text-[#57544D]">
              所有多余的书架、榜单和通用课程都已默认隐藏，只保留最核心的四件事：
              <strong>今日镜子</strong>、<strong>今日专属播客</strong>、<strong>今日真话练习</strong>、以及<strong>按你记录精准推送的 1–3 条内容</strong>。
            </p>
          </section>

          {/* Data Collection */}
          <section className="p-4 rounded-2xl bg-white border border-[#ECEAE4] space-y-2">
            <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#1C1B18]">
              <Database className="w-4 h-4 text-emerald-700" />
              2. 关键：如何把你的数据收集得足够
            </div>
            <ul className="space-y-1.5 text-[#57544D]">
              <li>
                • <strong>全天无感采集</strong>：照常在微信、小红书、浏览器里使用你的语音输入法说话，晚上顺手一键上传到 Google Drive「输入法记录」。
              </li>
              <li>
                • <strong>镜子回声补充</strong>：看完「今日镜子」后，直接在底部的回声框对着语音键盘说两句真实想法，记录你当下的自我觉察。
              </li>
              <li>
                • <strong>越真实、越连续，系统越懂你</strong>：系统会随着你的长期表达自动更新个人画像、修正语音错字、并把你真正想说的话写成次日的专属播客。
              </li>
            </ul>
          </section>

          {/* Daily Push Workflow */}
          <section className="p-4 rounded-2xl bg-white border border-[#ECEAE4] space-y-2">
            <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#1C1B18]">
              <RefreshCw className="w-4 h-4 text-amber-700" />
              3. 每天怎么接收新推送（无需天天重装软件）
            </div>
            <ol className="space-y-1.5 text-[#57544D] list-decimal list-inside">
              <li>晚上把当天的语音输入法记录一键上传到 Drive「输入法记录」。</li>
              <li>
                反重力会自动（或你说一句「跑今日总控同步」）在你的私有 Drive
                <code className="mx-1 px-1.5 py-0.5 rounded bg-[#F1EFEA] text-[11.5px]">03_outbox/daily-feed/</code>
                生成当天不到 10KB 的专属日包（<code className="px-1 py-0.5 rounded bg-[#F1EFEA] text-[11.5px]">YYYY-MM-DD.json</code>）。
              </li>
              <li>
                打开本软件，点右上角<strong>「导入日包」</strong>选中它（或在设置里绑定私有同步链接一键刷新），镜子、每日播客和精准推荐 <strong>1 秒热更新</strong>，原有复习记录全部保留。
              </li>
            </ol>
          </section>

          {/* Privacy */}
          <section className="p-4 rounded-2xl bg-[#FAF6EE] border border-amber-200/70 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-amber-900">
              <ShieldCheck className="w-4 h-4 text-amber-700" />
              4. 隐私与数据主权红线
            </div>
            <p className="text-[12.5px] text-[#5C4A2B]">
              应用本身只是干净的开源外壳；你的个人真实记录、每日镜子与私密反思仅保存在你本机与你的私有 Google Drive，绝不写入公开代码仓库。导入外部文本时，系统也会自动对邮箱、手机号与长随机密钥脱敏。
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-white border-t border-[#ECEAE4] flex items-center gap-2.5">
          <button
            onClick={() => {
              onClose();
              onTriggerImport();
            }}
            className="flex-1 h-10 rounded-xl bg-[#1C1B18] text-[#FAF9F6] text-[13px] font-medium"
          >
            立刻导入今日日包
          </button>
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-xl border border-[#E5E2DA] text-[13px] text-[#57544D]"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};
