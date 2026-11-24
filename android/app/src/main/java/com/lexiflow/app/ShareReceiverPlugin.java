package com.lexiflow.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {
    public static final String ACTION_ADD_WORD = "com.lexiflow.app.ACTION_ADD_WORD";

    private JSObject pendingPayload = null;

    @Override
    public void load() {
        super.load();
        if (getActivity() != null) {
            captureIntent(getActivity().getIntent());
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        captureIntent(intent);
    }

    private void captureIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (ACTION_ADD_WORD.equals(action)) {
            String word = intent.getStringExtra("word");
            String context = intent.getStringExtra("context");
            if (word != null && !word.trim().isEmpty()) {
                JSObject payload = new JSObject();
                payload.put("action", "word");
                payload.put("text", word.trim());
                payload.put("context", context != null ? context.trim() : "");
                payload.put("source", "keyboard");
                pendingPayload = payload;
                notifyListeners("shareReceived", payload);
                intent.setAction(Intent.ACTION_MAIN);
            }
            return;
        }
        if (Intent.ACTION_SEND.equals(action) && intent.getType() != null && intent.getType().startsWith("text/")) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null && !sharedText.trim().isEmpty()) {
                String trimmed = sharedText.trim();
                int wordCount = trimmed.split("\\s+").length;
                JSObject payload = new JSObject();
                payload.put("action", wordCount <= 4 && !trimmed.contains("\n") ? "word" : "text");
                payload.put("text", trimmed);
                payload.put("source", "android_share");
                pendingPayload = payload;
                notifyListeners("shareReceived", payload);
                intent.setAction(Intent.ACTION_MAIN);
            }
        }
    }

    @PluginMethod
    public void consumePendingShare(PluginCall call) {
        JSObject res = new JSObject();
        if (pendingPayload != null) {
            res.put("hasPayload", true);
            res.put("payload", pendingPayload);
            pendingPayload = null;
        } else {
            res.put("hasPayload", false);
        }
        call.resolve(res);
    }
}
