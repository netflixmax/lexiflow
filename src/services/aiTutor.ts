import type { AiConfig } from '../types';

export const AI_PROVIDER_PRESETS: Record<
  AiConfig['provider'],
  { label: string; baseUrl: string; defaultModel: string }
> = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  custom: {
    label: '自定义 OpenAI 兼容接口',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
};

async function callAi(config: AiConfig, systemPrompt: string, userPrompt: string): Promise<string> {
  if (!config.enabled || !config.apiKey.trim()) {
    throw new Error('请先在「我的 → AI 助教（可选）」中启用并配置 API Key。');
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  if (config.provider === 'gemini') {
    const endpoint = `${baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey.trim())}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gemini 请求失败 (${res.status}): ${txt.slice(0, 160)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('模型未返回有效内容');
    return text.trim();
  }

  // OpenAI / DeepSeek / OpenAI-compatible
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI 请求失败 (${res.status}): ${txt.slice(0, 160)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型未返回有效内容');
  return content.trim();
}

export async function explainWordInContext(
  config: AiConfig,
  word: string,
  sentence: string,
): Promise<string> {
  return callAi(
    config,
    '你是一位极简、深刻的英语语言学与认知助教。请用中文简洁输出，帮助用户掌握词汇在真实语境中的精准含义与细微差别。不要寒暄。',
    `目标词：${word}\n原句：${sentence}\n\n请按以下3点精炼输出：\n1. 当前语境精准释义（一句话）\n2. 词源或核心意象（帮助长期记住）\n3. 同义辨析或一个高阶例句`,
  );
}

export async function analyzeSentenceSyntax(
  config: AiConfig,
  sentence: string,
): Promise<string> {
  return callAi(
    config,
    '你是一位擅长拆解英文哲学、原著与AI论文长难句的助教。输出简洁、结构清晰、无废话。',
    `请拆解以下英文句子：\n"${sentence}"\n\n请输出：\n1. 核心主干（主谓宾）\n2. 修饰与逻辑关系（从句/分词/转折）\n3. 信达雅的中文直译与意译\n4. 值得吸收的1-2个表达`,
  );
}

export async function distillArticleInsight(
  config: AiConfig,
  title: string,
  excerpt: string,
): Promise<string> {
  return callAi(
    config,
    '你是一位追求第一性原理的英文深度阅读导师。用极简中文帮助读者提炼文章核心洞见与关键术语。',
    `标题：${title}\n正文节选：\n${excerpt.slice(0, 3200)}\n\n请输出：\n1. 核心论点（2-3句话）\n2. 可迁移的思维模型或生产力启发（2条）\n3. 文中最值得精学的3个英文表达及用法`,
  );
}

export async function testAiConnection(config: AiConfig): Promise<string> {
  return callAi(config, 'Reply concisely.', 'Say "LexiFlow AI 助教已连接" in one line.');
}
