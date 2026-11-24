import React from 'react';
import { BookOpen, Sparkles, X } from 'lucide-react';
import type { LiveReadmeData } from '../types';

interface ReadmeModalProps {
  readme: LiveReadmeData;
  onClose: () => void;
  onTriggerImport: () => void;
}

export const ReadmeModal: React.FC<ReadmeModalProps> = ({
  readme,
  onClose,
  onTriggerImport,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg bg-[#FAF9F6] rounded-t-3xl sm:rounded-3xl max-h-[86vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-[#ECEAE4] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#1C1B18] text-[#FAF9F6] flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-[16px] font-semibold text-[#1C1B18]">README · 我的个性化系统</h2>
              <p className="text-[11px] text-[#78756E]">
                实时更新于 {readme.updatedAt} · {readme.subtitle}
              </p>
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

        {/* Dynamic Sections driven by live daily feed */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 text-[13.5px] leading-relaxed text-[#3D3A34]">
          {readme.sections.map((sec, idx) => (
            <section
              key={idx}
              className="p-4 rounded-2xl bg-white border border-[#ECEAE4] space-y-1.5"
            >
              <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#1C1B18]">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{sec.title}</span>
              </div>
              <p className="text-[#57544D] whitespace-pre-line">{sec.body}</p>
            </section>
          ))}
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
            导入最新日包（同步更新 README）
          </button>
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-xl border border-[#E5E2DA] text-[13px] text-[#57544D]"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
