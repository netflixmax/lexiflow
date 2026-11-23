package com.lexiflow.app

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "NativeTts")
class NativeTtsPlugin : Plugin() {
    private lateinit var engine: LexiSpeechEngine

    override fun load() {
        engine = LexiSpeechEngine(context)
        engine.warmupKokoro()
    }

    @PluginMethod
    fun configure(call: PluginCall) {
        val prev = engine.config
        engine.config = SpeechConfig(
            engine = call.getString("engine", prev.engine) ?: prev.engine,
            kokoroSpeaker = call.getInt("kokoroSpeaker", prev.kokoroSpeaker) ?: prev.kokoroSpeaker,
            rimeApiKey = call.getString("rimeApiKey", prev.rimeApiKey) ?: prev.rimeApiKey,
            rimeModel = call.getString("rimeModel", prev.rimeModel) ?: prev.rimeModel,
            rimeSpeaker = call.getString("rimeSpeaker", prev.rimeSpeaker) ?: prev.rimeSpeaker
        )
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val ret = JSObject()
        ret.put("kokoroBundled", engine.isKokoroBundled())
        ret.put("cacheBytes", engine.audioCacheSizeBytes())
        call.resolve(ret)
    }

    @PluginMethod
    fun fetchRimeVoices(call: PluginCall) {
        val model = call.getString("model", "coda") ?: "coda"
        engine.fetchRimeVoices(model) { voices ->
            val arr = JSArray()
            voices.forEach { arr.put(it) }
            val ret = JSObject()
            ret.put("voices", arr)
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun clearCache(call: PluginCall) {
        val ok = engine.clearAudioCache()
        val ret = JSObject()
        ret.put("cleared", ok)
        call.resolve(ret)
    }

    @PluginMethod
    fun speak(call: PluginCall) {
        val text = call.getString("text", "") ?: ""
        val rate = call.getFloat("rate", 0.92f) ?: 0.92f
        val utteranceId = call.getString("utteranceId", "utt_${System.currentTimeMillis()}") ?: "utt"

        engine.speakSingle(text, rate) {
            val data = JSObject()
            data.put("utteranceId", utteranceId)
            notifyListeners("ttsDone", data)
        }

        val ret = JSObject()
        ret.put("utteranceId", utteranceId)
        call.resolve(ret)
    }

    @PluginMethod
    fun speakSequence(call: PluginCall) {
        val arr = call.getArray("sentences")
        val sentences = mutableListOf<String>()
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val s = arr.optString(i, "")
                if (s.isNotBlank()) sentences.add(s)
            }
        }
        val startIndex = call.getInt("startIndex", 0) ?: 0
        val rate = call.getFloat("rate", 0.92f) ?: 0.92f
        val loopSingle = call.getBoolean("loopSingle", false) ?: false

        engine.speakSequence(
            sentences = sentences,
            startIndex = startIndex,
            rate = rate,
            loopSingle = loopSingle,
            onSentenceStart = { idx ->
                val data = JSObject()
                data.put("index", idx)
                notifyListeners("ttsSentenceStart", data)
            },
            onComplete = {
                val data = JSObject()
                data.put("completed", true)
                notifyListeners("ttsSequenceDone", data)
            }
        )
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        engine.stop()
        call.resolve()
    }

    override fun handleOnDestroy() {
        engine.shutdown()
        super.handleOnDestroy()
    }
}
