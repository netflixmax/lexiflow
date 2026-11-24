import type { DailyMirrorCard, DailyPick, DailyScenarioCard } from '../types';

export const SEED_DAILY_MIRROR: DailyMirrorCard = {
  id: 'mirror-2026-11-23',
  date: '2026-11-23',
  title: '你的第一张真实自我复盘卡',
  summary:
    '昨天 179 条输入里，你 70% 的真实能量投入在「搭建个人 AI 基础设施（自研语音键盘 + LexiFlow 英语系统）」。凌晨 02:23 你随口说出“AI 让所有学科变成爱好”，晚上 19:27 你亲自把它写成了英文——真正能记住的英文，永远是你内心真正想说的话。',
  highlights: [
    '真实注意力：英语工具打磨 35% · 多 Agent 总控 35% · 前沿哲思 15% · 现实副业与社交 15%',
    '高光洞察：拆解出「Model 智商 × Harness 交互壳 × Personal State 个人状态」三层结构',
    '北极星方向：不断认识自己 → 不断更新自己 → 让线上 AI 瑰宝打通线下真实链接',
  ],
  mirrorQuestion:
    '昨天你花了大量时间折腾工具，但真正听读英文的时间并不长。此刻你最想先享受「亲手进化工具」的乐趣，还是每天花 10 分钟用自己的真话把英语真正说顺？',
  userReflection: '',
};

export const SEED_DAILY_SCENARIOS: DailyScenarioCard[] = [
  {
    id: 'scene-20261123-1',
    date: '2026-11-23',
    sceneTag: '小红书 · 思想火花',
    zhOriginal: 'AI 普及以后，学科界限会慢慢变小，所有学科都会变成爱好。',
    userAttempt: 'With AI tools, the wall between subjects are fading. Now, almost every field can become your hobby.',
    tip: '你昨晚的原句很有灵气！只需微调单复数：the walls ... are（或 the wall ... is），泛指用 a hobby 更自然。',
    enSenseGroups: [
      'With AI tools,',
      'the walls between subjects',
      'are slowly fading.',
      'Almost any field',
      'can now become a hobby.',
    ],
    enNatural:
      'With AI tools, the walls between subjects are slowly fading. Almost any field can now become a hobby.',
    keyPhrase: 'the walls between subjects are slowly fading',
    domain: '思想表达',
    status: 'pending',
  },
  {
    id: 'scene-20261123-2',
    date: '2026-11-23',
    sceneTag: '分享自研产品',
    zhOriginal: '我自己做了一个语音输入法，数据可以私有化，随时导出给 AI。',
    tip: '用 keep my data private 和 whenever I want，口语自然又利落。',
    enSenseGroups: [
      'I built my own voice keyboard',
      'so I can keep my data private',
      'and export it to AI',
      'whenever I want.',
    ],
    enNatural:
      'I built my own voice keyboard so I can keep my data private and export it to AI whenever I want.',
    keyPhrase: 'keep my data private',
    domain: '分享产品',
    status: 'pending',
  },
  {
    id: 'scene-20261123-3',
    date: '2026-11-23',
    sceneTag: '锐评 AI 工具',
    zhOriginal: 'Grok Bot 的交互壳是一流的但模型差，Google 的模型好但交互壳笨重，两者融合就无敌了。',
    tip: 'falls short（略显不足）和 clunky（笨重难用）是母语者评价软件最地道的词。',
    enSenseGroups: [
      'Grok Bot has a top-notch harness,',
      'but its model falls short.',
      'Google has a great model,',
      'but a clunky harness.',
      'Combine the two,',
      'and it would be unbeatable.',
    ],
    enNatural:
      'Grok Bot has a top-notch harness, but its model falls short. Google has a great model, but a clunky harness. Combine the two, and it would be unbeatable.',
    keyPhrase: 'a clunky harness',
    domain: 'AI 洞察',
    status: 'pending',
  },
  {
    id: 'scene-20261123-4',
    date: '2026-11-23',
    sceneTag: '终极产品愿景',
    zhOriginal: '世界最好的模型配上最懂我的状态，就是一个能记住我每个偏好的私人专家。',
    tip: 'Pair A with B, and you get C 是英文里表达“把两件事结合起来就能得到……”的万能句型。',
    enSenseGroups: [
      "Pair the world's smartest model",
      'with a system that truly knows me,',
      'and you get a personal expert',
      'who remembers every preference',
      'in real time.',
    ],
    enNatural:
      "Pair the world's smartest model with a system that truly knows me, and you get a personal expert who remembers every preference in real time.",
    keyPhrase: 'pair A with B',
    domain: '下达意图',
    status: 'pending',
  },
  {
    id: 'scene-20261123-5',
    date: '2026-11-23',
    sceneTag: '给 Agent 下意图',
    zhOriginal: '我希望阅读跟 AI 工具相关的东西、哲人思考、英语原著和论文，界面要简洁。',
    tip: '直白清晰地列举四个方向，用 clean interface 表达“界面简洁”。',
    enSenseGroups: [
      'I want to read about AI tools,',
      'philosophical thinking,',
      'English originals, and papers,',
      'all inside a clean,',
      'distraction-free interface.',
    ],
    enNatural:
      'I want to read about AI tools, philosophical thinking, English originals, and papers, all inside a clean, distraction-free interface.',
    keyPhrase: 'distraction-free interface',
    domain: '下达意图',
    status: 'pending',
  },
  {
    id: 'scene-20261123-6',
    date: '2026-11-23',
    sceneTag: '反馈听感体验',
    zhOriginal: '这个播客做得不错，但默认声音一般，我英语水平还不高，纯听力很有挑战。',
    tip: 'isn’t that strong yet（目前还没那么强）比 my English is poor 更自然、更不卑不亢。',
    enSenseGroups: [
      'The podcast itself is quite good,',
      "but the default voice doesn't sound great.",
      "My English isn't that strong yet,",
      'so pure listening',
      'is still pretty challenging.',
    ],
    enNatural:
      "The podcast itself is quite good, but the default voice doesn't sound great. My English isn't that strong yet, so pure listening is still pretty challenging.",
    keyPhrase: "isn't that strong yet",
    domain: '体验反馈',
    status: 'pending',
  },
];

export const SEED_PERSONAL_ARTICLE = {
  id: 'personal-pack-2026-11-23',
  title: 'My Voice Keyboard & The Fading Walls (2026-11-23 专属微播客)',
  subtitle: '四级 550 分 i+1 定制 · 源自你昨天的真实思考',
  author: 'Rong × Antigravity',
  source: '个人专属日包',
  category: 'ai' as const,
  publishedAt: '2026-11-23',
  readProgress: 0,
  wordCount: 162,
  isUserImported: true,
  tags: ['今日专属', 'i+1', 'AI-Native'],
  paragraphs: [
    "Yesterday, I built my own voice keyboard. It's not a fancy app, but it gave me a crazy feeling: for the first time, my daily thoughts belong to me. I can keep all my data private, and hand it to AI whenever I need a fresh perspective.",
    'That small win led me to a bigger thought. With AI tools, the walls between subjects are slowly fading. You no longer need to be a computer scientist to build an app, or a linguist to design your own way of learning English. Almost any field can now become a personal hobby.',
    "Right now, my biggest frustration is juggling too many AI agents across different apps. Some have a smooth harness but a weak model; others have a brilliant model wrapped in a clunky interface. What I really want is simple: pair the world's smartest model with a system that truly knows me. Not just a chatbot I talk to, but a quiet mirror that remembers my habits, sharpens my English, and helps me see who I really am.",
  ],
};

export const SEED_DAILY_PICKS: DailyPick[] = [
  {
    id: 'pick-20261123-1',
    tag: 'AI 工具实践',
    title: 'Simon Willison：一线 AI 工具与个人工作流笔记',
    reason: '贴合你对「用 AI 随手造自己的工具」与低摩擦工作流的探索。',
    url: 'https://simonwillison.net/',
  },
  {
    id: 'pick-20261123-2',
    tag: 'Harness & 端侧模型',
    title: 'Hugging Face Blog：Agent Harness 与端侧小模型',
    reason: '直接呼应你对「一流交互壳 × 顶级模型」及端侧蒸馏的兴趣。',
    url: 'https://huggingface.co/blog',
  },
  {
    id: 'pick-20261123-3',
    tag: '哲人思辨',
    title: 'Aeon Essays：跨学科思想与自我认知长文',
    reason: '契合你「AI 让学科界限消融、不断认识自己」的长期阅读品味。',
    url: 'https://aeon.co/essays',
  },
];

export interface InterestIsland {
  id: string;
  title: string;
  subtitle: string;
  category: 'ai' | 'philosophy' | 'book' | 'paper';
  url: string;
  sourceLabel: string;
}

export const INTEREST_ISLANDS: InterestIsland[] = [
  {
    id: 'island-ai-tools',
    title: 'AI 工具实践',
    subtitle: 'Simon Willison 一线 AI 工程笔记',
    category: 'ai',
    url: 'https://simonwillison.net/',
    sourceLabel: 'simonwillison.net',
  },
  {
    id: 'island-harness',
    title: 'Harness 与端侧小模型',
    subtitle: 'Hugging Face 开源模型与端侧前沿',
    category: 'ai',
    url: 'https://huggingface.co/blog',
    sourceLabel: 'huggingface.co/blog',
  },
  {
    id: 'island-philosophy',
    title: '哲人思辨',
    subtitle: 'Aeon 深度思想随笔 & 沉思录',
    category: 'philosophy',
    url: 'https://aeon.co/essays',
    sourceLabel: 'aeon.co',
  },
  {
    id: 'island-distill',
    title: '模型蒸馏经典论文',
    subtitle: 'Hinton 知识蒸馏原论文摘要入门',
    category: 'paper',
    url: 'https://arxiv.org/abs/1503.02531',
    sourceLabel: 'arXiv:1503.02531',
  },
];
