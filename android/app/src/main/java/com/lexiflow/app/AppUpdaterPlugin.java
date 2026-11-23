package com.lexiflow.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
            JSObject ret = new JSObject();
            ret.put("versionName", info.versionName != null ? info.versionName : "1.0.0");
            ret.put("versionCode", versionCode);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read version: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String urlStr = call.getString("url", "");
        String expectedSha256 = call.getString("sha256", "");
        String fileName = call.getString("fileName", "LexiFlow-update.apk");

        if (urlStr == null || urlStr.trim().isEmpty()) {
            call.reject("Missing APK download URL");
            return;
        }

        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                emitProgress(0, 0, 0, "downloading");

                // Follow redirects (important for GitHub Releases and Google Drive)
                URL currentUrl = new URL(urlStr);
                int redirects = 0;
                while (redirects < 6) {
                    conn = (HttpURLConnection) currentUrl.openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(30000);
                    conn.setRequestProperty("User-Agent", "LexiFlow-Android-Updater/1.0");
                    int code = conn.getResponseCode();
                    if (code == HttpURLConnection.HTTP_MOVED_TEMP
                        || code == HttpURLConnection.HTTP_MOVED_PERM
                        || code == HttpURLConnection.HTTP_SEE_OTHER
                        || code == 307 || code == 308) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (loc == null) break;
                        currentUrl = new URL(currentUrl, loc);
                        redirects++;
                    } else {
                        break;
                    }
                }

                if (conn == null || conn.getResponseCode() >= 400) {
                    int code = conn != null ? conn.getResponseCode() : -1;
                    throw new RuntimeException("下载失败，HTTP 状态码：" + code);
                }

                long totalBytes = conn.getContentLengthLong();
                File updatesDir = new File(getContext().getCacheDir(), "updates");
                if (!updatesDir.exists()) updatesDir.mkdirs();
                File apkFile = new File(updatesDir, fileName.replaceAll("[^a-zA-Z0-9._-]", "_"));

                try (InputStream in = new BufferedInputStream(conn.getInputStream());
                     FileOutputStream out = new FileOutputStream(apkFile)) {
                    byte[] buffer = new byte[16384];
                    long downloaded = 0;
                    int lastPct = -1;
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        downloaded += read;
                        if (totalBytes > 0) {
                            int pct = (int) Math.min(100, (downloaded * 100) / totalBytes);
                            if (pct != lastPct) {
                                lastPct = pct;
                                emitProgress(pct, downloaded, totalBytes, "downloading");
                            }
                        }
                    }
                    out.flush();
                }

                if (expectedSha256 != null && !expectedSha256.trim().isEmpty()) {
                    emitProgress(100, totalBytes, totalBytes, "verifying");
                    String actual = sha256Of(apkFile);
                    if (!actual.equalsIgnoreCase(expectedSha256.trim())) {
                        apkFile.delete();
                        throw new RuntimeException("安装包 SHA-256 校验不匹配，已中止安装");
                    }
                }

                emitProgress(100, totalBytes, totalBytes, "installing");
                launchInstaller(apkFile);

                JSObject ret = new JSObject();
                ret.put("started", true);
                call.resolve(ret);
            } catch (Exception e) {
                emitProgress(0, 0, 0, "error");
                call.reject(e.getMessage() != null ? e.getMessage() : "更新失败");
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    private void launchInstaller(File apkFile) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent permIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + ctx.getPackageName())
            );
            permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(permIntent);
            throw new RuntimeException("请在系统设置中允许 LexiFlow 安装未知应用，授权后返回再点一次安装。");
        }

        Uri apkUri = FileProvider.getUriForFile(
            ctx,
            ctx.getPackageName() + ".fileprovider",
            apkFile
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(intent);
    }

    private void emitProgress(int progress, long downloaded, long total, String status) {
        JSObject data = new JSObject();
        data.put("progress", progress);
        data.put("downloadedBytes", downloaded);
        data.put("totalBytes", total);
        data.put("status", status);
        notifyListeners("downloadProgress", data);
    }

    private String sha256Of(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream fis = new FileInputStream(file)) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = fis.read(buf)) > 0) {
                digest.update(buf, 0, n);
            }
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : digest.digest()) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
