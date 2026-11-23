# LexiFlow — 极简能力导向英文精进 App (Android)

**LexiFlow** 是一款专为长期英语能力提升与生产力复利打造的极简 Android 应用，围绕 **“高价值输入（AI 工具 / 哲人思考 / 英文原著 / 英文论文） → 语境点词采集 → FSRS 科学记忆 → 精听强化”** 闭环设计。

## 核心特性

- **100% 永久免费核心版**：所有精读、原著、论文、开源查词、FSRS 复习、原生 TTS 精听与播客功能均无需订阅或 API Key。
- **高价值英文内容引擎**：
  - **AI 工具与工程**：内置精读文章 + 实时拉取 Simon Willison / Hugging Face 等 RSS。
  - **哲人思考**：内置马可·奥勒留、塞涅卡、罗素等经典哲思 + 实时拉取 Aeon / Farnam Street。
  - **英文原著**：内置梭罗《瓦尔登湖》、培根随笔多章节原著 + 接入 Project Gutenberg 70,000+ 免费原著库 + 本地 **EPUB / TXT / MD** 导入。
  - **英文论文**：接入 **arXiv 官方 API** 实时同步最新 `cs.AI / cs.CL / cs.LG` 论文 + 本地 **PDF 论文** 离线解析精读。
- **科学记忆（FSRS-5 算法）**：
  - 集成开源 `ts-fsrs` 调度器，支持语境完形填空卡片、阅读 i+1 生词复现高亮、内置「AI & 论文核心词 / 哲人思辨词汇 / 高阶生产力词」词包。
- **精听工坊**：
  - 原生 Android `TextToSpeech` 离线逐句朗读，支持 0.75x–1.35x 变速、美音/英音切换、**A-B 单句循环**与**盲听听写模式**。
  - 内置 AI / 哲学 / 英语播客源（Latent Space、Philosophize This!、BBC 6 Minute English、TED Talks Daily）及自定义 RSS 播客订阅。
- **可选附加功能：AI 助教（BYOK）**：
  - 默认折叠不打扰界面，可按需填入自己的 Gemini / OpenAI / DeepSeek API Key，解锁**语境精析、长难句语法拆解、深度导读**。
- **应用内一键更新（In-App Updater）**：
  - 内置原生 Android 下载与安装插件（支持 GitHub Releases 或自定义 `update.json`），固定签名密钥确保覆盖升级不丢失学习数据。

## 本地构建与发版

```bash
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
```

推送 `v1.x.x` 标签到 GitHub 后，`.github/workflows/release-apk.yml` 会自动编译 APK 并发布到 GitHub Releases，手机端打开 **我的 → 应用内一键更新 → 检查更新** 即可一键升级。
