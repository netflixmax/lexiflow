package com.lexiflow.app;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "NativeTts")
public class NativeTtsPlugin extends Plugin {
    private TextToSpeech tts;
    private boolean initialized = false;
    private Runnable pendingTask = null;

    @Override
    public void load() {
        initTts();
    }

    private void initTts() {
        if (tts != null) return;
        tts = new TextToSpeech(getContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                initialized = true;
                tts.setLanguage(Locale.US);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {}

                    @Override
                    public void onDone(String utteranceId) {
                        JSObject data = new JSObject();
                        data.put("utteranceId", utteranceId);
                        notifyListeners("ttsDone", data);
                    }

                    @Override
                    public void onError(String utteranceId) {
                        JSObject data = new JSObject();
                        data.put("utteranceId", utteranceId);
                        data.put("error", "TTS playback error");
                        notifyListeners("ttsDone", data);
                    }
                });
                if (pendingTask != null) {
                    Runnable task = pendingTask;
                    pendingTask = null;
                    task.run();
                }
            }
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        float rate = call.getFloat("rate", 0.95f);
        String localeStr = call.getString("locale", "en-US");
        String utteranceId = call.getString("utteranceId", "utt_" + System.currentTimeMillis());

        Runnable runSpeak = () -> {
            if (tts == null) {
                call.reject("TTS engine unavailable");
                return;
            }
            Locale loc = "en-GB".equalsIgnoreCase(localeStr) ? Locale.UK : Locale.US;
            int langRes = tts.setLanguage(loc);
            if (langRes == TextToSpeech.LANG_MISSING_DATA || langRes == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(Locale.US);
            }
            tts.setSpeechRate(Math.max(0.5f, Math.min(2.0f, rate)));
            Bundle params = new Bundle();
            params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);

            JSObject ret = new JSObject();
            ret.put("utteranceId", utteranceId);
            call.resolve(ret);
        };

        if (initialized) {
            runSpeak.run();
        } else {
            pendingTask = runSpeak;
            initTts();
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        pendingTask = null;
        if (tts != null) {
            tts.stop();
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
            initialized = false;
        }
        super.handleOnDestroy();
    }
}
