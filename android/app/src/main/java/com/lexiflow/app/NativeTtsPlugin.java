package com.lexiflow.app;

import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;

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
                selectBestVoice(Locale.US, null);
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

    private int scoreVoice(Voice v, Locale preferredLocale) {
        if (v == null || v.getLocale() == null) return -1000;
        if (!"en".equalsIgnoreCase(v.getLocale().getLanguage())) return -1000;
        int score = 0;
        if (preferredLocale != null && preferredLocale.getCountry().equalsIgnoreCase(v.getLocale().getCountry())) {
            score += 40;
        }
        int q = v.getQuality();
        if (q >= Voice.QUALITY_VERY_HIGH) score += 60;
        else if (q >= Voice.QUALITY_HIGH) score += 45;
        else if (q >= Voice.QUALITY_NORMAL) score += 20;

        String name = v.getName() != null ? v.getName().toLowerCase(Locale.ROOT) : "";
        // Strongly prefer Google/Neural/Network natural voices over legacy robotic ones
        if (name.contains("neural") || name.contains("wavenet") || name.contains("natural")) score += 50;
        if (name.contains("network")) score += 25;
        if (name.contains("local") && name.contains("-x-")) score += 30;
        if (name.contains("legacy") || name.contains("compact")) score -= 40;
        if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) {
            score -= 100;
        }
        return score;
    }

    private void selectBestVoice(Locale locale, String preferredVoiceName) {
        if (tts == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices == null || voices.isEmpty()) return;

            if (preferredVoiceName != null && !preferredVoiceName.isEmpty()) {
                for (Voice v : voices) {
                    if (preferredVoiceName.equals(v.getName())) {
                        tts.setVoice(v);
                        return;
                    }
                }
            }

            Voice best = null;
            int bestScore = Integer.MIN_VALUE;
            for (Voice v : voices) {
                int s = scoreVoice(v, locale);
                if (s > bestScore) {
                    bestScore = s;
                    best = v;
                }
            }
            if (best != null && bestScore > 0) {
                tts.setVoice(best);
            }
        } catch (Exception ignored) {
            // Fall back to default setLanguage voice
        }
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        Runnable task = () -> {
            JSArray arr = new JSArray();
            if (tts != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                try {
                    Set<Voice> voices = tts.getVoices();
                    if (voices != null) {
                        List<Voice> enVoices = new ArrayList<>();
                        for (Voice v : voices) {
                            if (v.getLocale() != null && "en".equalsIgnoreCase(v.getLocale().getLanguage())) {
                                if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) {
                                    continue;
                                }
                                enVoices.add(v);
                            }
                        }
                        Collections.sort(enVoices, (a, b) -> Integer.compare(scoreVoice(b, Locale.US), scoreVoice(a, Locale.US)));
                        int limit = Math.min(enVoices.size(), 12);
                        for (int i = 0; i < limit; i++) {
                            Voice v = enVoices.get(i);
                            JSObject obj = new JSObject();
                            obj.put("name", v.getName());
                            obj.put("locale", v.getLocale().toLanguageTag());
                            obj.put("quality", v.getQuality());
                            obj.put("isNetwork", v.isNetworkConnectionRequired());
                            arr.put(obj);
                        }
                    }
                } catch (Exception ignored) {}
            }
            JSObject ret = new JSObject();
            ret.put("voices", arr);
            call.resolve(ret);
        };

        if (initialized) {
            task.run();
        } else {
            pendingTask = task;
            initTts();
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        float rate = call.getFloat("rate", 0.90f);
        String localeStr = call.getString("locale", "en-US");
        String voiceName = call.getString("voiceName", "");
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
            selectBestVoice(loc, voiceName);
            tts.setSpeechRate(Math.max(0.5f, Math.min(2.0f, rate)));
            tts.setPitch(1.0f);
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
