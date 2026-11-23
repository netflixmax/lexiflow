import type { UpdateConfig, UpdateInfo } from '../types';

function semverToCode(version: string): number {
  const clean = version.replace(/^v/i, '').split('-')[0];
  const [maj = 0, min = 0, pat = 0] = clean.split('.').map((n) => parseInt(n, 10) || 0);
  return maj * 10000 + min * 100 + pat;
}

/**
 * Check for latest APK update from either:
 * 1) Custom manifestUrl (update.json hosted on GitHub Raw / Google Drive / CDN), OR
 * 2) GitHub Releases API (https://api.github.com/repos/{owner}/{repo}/releases/latest)
 */
export async function checkForAppUpdate(config: UpdateConfig): Promise<UpdateInfo> {
  const manifestUrl = config.manifestUrl.trim();
  const githubRepo = config.githubRepo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '');

  if (manifestUrl) {
    const res = await fetch(manifestUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`更新清单请求失败 (${res.status})`);
    const data = await res.json();
    if (!data.versionName || !data.apkUrl) {
      throw new Error('更新清单格式缺少 versionName 或 apkUrl');
    }
    return {
      versionName: String(data.versionName).replace(/^v/i, ''),
      versionCode: Number(data.versionCode) || semverToCode(String(data.versionName)),
      apkUrl: String(data.apkUrl),
      releaseNotes: String(data.releaseNotes || '包含体验优化与功能更新。'),
      sha256: data.sha256 ? String(data.sha256) : undefined,
      publishedAt: data.publishedAt ? String(data.publishedAt) : undefined,
    };
  }

  if (githubRepo) {
    const res = await fetch(`https://api.github.com/repos/${githubRepo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('该 GitHub 仓库尚未发布 Release，请先发布带 APK 附件的 Release。');
      }
      throw new Error(`GitHub Release 检查失败 (${res.status})`);
    }
    const rel = await res.json();
    const assets: Array<{ name: string; browser_download_url: string }> = rel.assets ?? [];
    const apkAsset = assets.find((a) => a.name.toLowerCase().endsWith('.apk'));
    if (!apkAsset) {
      throw new Error('最新 GitHub Release 中未找到 .apk 安装包附件。');
    }
    const versionName = String(rel.tag_name || rel.name || '1.0.0').replace(/^v/i, '');
    return {
      versionName,
      versionCode: semverToCode(versionName),
      apkUrl: apkAsset.browser_download_url,
      releaseNotes: String(rel.body || '新版本已发布，点击立即下载安装。'),
      publishedAt: rel.published_at ? String(rel.published_at).slice(0, 10) : undefined,
    };
  }

  throw new Error('请先填写 GitHub 仓库（如 用户名/lexiflow）或更新清单 URL。');
}
