package com.lexiflow.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaPlayer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.k2fsa.sherpa.onnx.GeneratedAudio
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

data class SpeechConfig(
    val engine: String = "kokoro", // "kokoro" | "rime" | "system"
    val kokoroSpeaker: Int = 3,    // 0..10
    val rimeApiKey: String = "",
    val rimeModel: String = "coda", // "coda" | "mistv3"
    val rimeSpeaker: String = "astra"
)

/**
 * Dual-engine studio-quality English speech engine:
 * 1) Offline Kokoro-82M (sherpa-onnx): 100% free, zero-network neural TTS with
 *    streaming AudioTrack and background next-sentence prefetching.
 * 2) Optional Rime Cloud API (coda / mistv3): ultra-natural podcast-grade voice
 *    with SHA-256 local WAV cache and background prefetching.
 * Automatically falls back cleanly (Rime -> Kokoro -> System TTS) if unavailable.
 */
class LexiSpeechEngine(context: Context) : TextToSpeech.OnInitListener {
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val bgScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val currentToken = AtomicInteger(0)
    private val playLock = Any()

    @Volatile var config: SpeechConfig = SpeechConfig()

    private var sysTts: TextToSpeech? = TextToSpeech(appContext, this)
    @Volatile private var sysTtsReady = false

    @Volatile private var kokoro: OfflineTts? = null
    @Volatile private var kokoroFailed = false

    @Volatile private var audioTrack: AudioTrack? = null
    @Volatile private var mediaPlayer: MediaPlayer? = null

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            sysTts?.language = Locale.US
            sysTtsReady = true
        }
    }

    fun isKokoroBundled(): Boolean {
        return try {
            val files = appContext.assets.list("kokoro-en")
            files != null && files.isNotEmpty()
        } catch (_: Exception) {
            false
        }
    }

    /** Pre-warm Kokoro model on background thread so first playback is instant. */
    fun warmupKokoro() {
        bgScope.launch {
            try { ensureKokoro() } catch (_: Exception) {}
        }
    }

    fun speakSingle(
        text: String,
        rate: Float,
        onDone: () -> Unit
    ) {
        val clean = text.trim()
        if (clean.isEmpty()) {
            mainHandler.post { onDone() }
            return
        }
        speakSequence(listOf(clean), 0, rate, false, onSentenceStart = {}, onComplete = onDone)
    }

    /**
     * Play a list of sentences seamlessly with background prefetching of sentence i+1
     * while sentence i plays, emitting onSentenceStart(index) for UI highlight sync.
     */
    fun speakSequence(
        sentences: List<String>,
        startIndex: Int,
        rate: Float,
        loopSingle: Boolean,
        onSentenceStart: (Int) -> Unit,
        onComplete: () -> Unit
    ) {
        stop()
        if (sentences.isEmpty() || startIndex !in sentences.indices) {
            mainHandler.post { onComplete() }
            return
        }
        val token = currentToken.incrementAndGet()
        val cfg = config
        val safeRate = rate.coerceIn(0.6f, 1.8f)

        when (cfg.engine) {
            "rime" -> {
                if (cfg.rimeApiKey.isNotBlank()) {
                    bgScope.launch {
                        playRimeSequence(sentences, startIndex, safeRate, loopSingle, cfg, token, onSentenceStart, onComplete)
                    }
                } else {
                    bgScope.launch {
                        playKokoroSequence(sentences, startIndex, safeRate, loopSingle, cfg, token, onSentenceStart, onComplete)
                    }
                }
            }
            "system" -> {
                playSystemSequence(sentences, startIndex, safeRate, loopSingle, token, onSentenceStart, onComplete)
            }
            else -> {
                bgScope.launch {
                    playKokoroSequence(sentences, startIndex, safeRate, loopSingle, cfg, token, onSentenceStart, onComplete)
                }
            }
        }
    }

    fun stop() {
        currentToken.incrementAndGet()
        try { sysTts?.stop() } catch (_: Exception) {}
        synchronized(playLock) {
            try { audioTrack?.stop() } catch (_: Exception) {}
            try { audioTrack?.release() } catch (_: Exception) {}
            audioTrack = null
            try { mediaPlayer?.stop() } catch (_: Exception) {}
            try { mediaPlayer?.release() } catch (_: Exception) {}
            mediaPlayer = null
        }
    }

    fun shutdown() {
        stop()
        try { kokoro?.release() } catch (_: Exception) {}
        kokoro = null
        try { sysTts?.stop() } catch (_: Exception) {}
        try { sysTts?.shutdown() } catch (_: Exception) {}
        sysTts = null
        bgScope.cancel()
    }

    // ---------- Engine 1: Offline Kokoro (sherpa-onnx) ----------

    private suspend fun playKokoroSequence(
        sentences: List<String>,
        startIndex: Int,
        rate: Float,
        loopSingle: Boolean,
        cfg: SpeechConfig,
        token: Int,
        onSentenceStart: (Int) -> Unit,
        onComplete: () -> Unit
    ) {
        val engine = try { ensureKokoro() } catch (_: Exception) { null }
        if (engine == null) {
            if (token == currentToken.get()) {
                playSystemSequence(sentences, startIndex, rate, loopSingle, token, onSentenceStart, onComplete)
            }
            return
        }

        val speakerId = cfg.kokoroSpeaker.coerceIn(0, 10)
        var track: AudioTrack? = null
        try {
            fun synth(idx: Int): Deferred<GeneratedAudio?> = bgScope.async {
                if (token != currentToken.get()) null
                else try {
                    engine.generate(sentences[idx], speakerId, rate)
                } catch (_: Exception) {
                    null
                }
            }

            var idx = startIndex
            var nextJob: Deferred<GeneratedAudio?>? = synth(idx)
            var cachedLoopAudio: GeneratedAudio? = null
            var playedAny = false
            var totalFrames = 0L

            while (token == currentToken.get() && idx < sentences.size) {
                val audio = if (loopSingle && cachedLoopAudio != null) {
                    cachedLoopAudio
                } else {
                    nextJob?.await()
                }

                if (token != currentToken.get()) return

                if (loopSingle && audio != null && audio.samples.isNotEmpty()) {
                    cachedLoopAudio = audio
                }

                // Prefetch next sentence in parallel while current sentence plays
                nextJob = if (!loopSingle && idx + 1 < sentences.size) synth(idx + 1) else null

                if (audio == null || audio.samples.isEmpty()) {
                    if (loopSingle) break
                    idx++
                    continue
                }

                if (track == null) {
                    track = createStreamTrack(audio.sampleRate)
                    synchronized(playLock) { audioTrack = track }
                    track.play()
                }

                playedAny = true
                val emitIdx = idx
                mainHandler.post {
                    if (token == currentToken.get()) onSentenceStart(emitIdx)
                }

                val pcm = floatToPcm16(audio.samples)
                track.write(pcm, 0, pcm.size)
                totalFrames += pcm.size

                // Brief natural breath pause (220ms) between sentences
                val silenceSamples = (audio.sampleRate * 0.22f).toInt()
                if (silenceSamples > 0) {
                    val silence = ShortArray(silenceSamples)
                    track.write(silence, 0, silence.size)
                    totalFrames += silence.size
                }

                // Wait until current sentence nearly finishes before firing next onSentenceStart
                val targetFrame = (totalFrames - audio.sampleRate / 10).coerceAtLeast(0L)
                while (token == currentToken.get() &&
                    track.playState == AudioTrack.PLAYSTATE_PLAYING &&
                    track.playbackHeadPosition.toLong() < targetFrame
                ) {
                    Thread.sleep(60)
                }

                if (!loopSingle) {
                    idx++
                }
            }

            val t = track
            if (t != null && playedAny) {
                while (token == currentToken.get() &&
                    t.playState == AudioTrack.PLAYSTATE_PLAYING &&
                    t.playbackHeadPosition.toLong() < totalFrames
                ) {
                    Thread.sleep(60)
                }
            }

            if (!playedAny && token == currentToken.get()) {
                playSystemSequence(sentences, startIndex, rate, loopSingle, token, onSentenceStart, onComplete)
                return
            }

            if (token == currentToken.get()) {
                mainHandler.post { onComplete() }
            }
        } catch (_: Exception) {
            if (token == currentToken.get()) {
                playSystemSequence(sentences, startIndex, rate, loopSingle, token, onSentenceStart, onComplete)
            }
        } finally {
            try { track?.stop() } catch (_: Exception) {}
            try { track?.release() } catch (_: Exception) {}
            synchronized(playLock) { if (audioTrack === track) audioTrack = null }
        }
    }

    @Synchronized
    private fun ensureKokoro(): OfflineTts? {
        kokoro?.let { return it }
        if (kokoroFailed) return null
        return try {
            val dir = prepareKokoroModelDir()
            val modelFile = File(dir, "model.int8.onnx").takeIf { it.exists() }
                ?: File(dir, "model.onnx")
            val voicesFile = File(dir, "voices.bin")
            val tokensFile = File(dir, "tokens.txt")
            val lexiconFile = File(dir, "lexicon.txt")
            if (!modelFile.exists() || !voicesFile.exists() || !tokensFile.exists() || !lexiconFile.exists()) {
                throw IllegalStateException("Kokoro model assets missing")
            }
            val kokoroConfig = OfflineTtsKokoroModelConfig(
                model = modelFile.absolutePath,
                voices = voicesFile.absolutePath,
                tokens = tokensFile.absolutePath,
                dataDir = File(dir, "espeak-ng-data").absolutePath,
                lexicon = lexiconFile.absolutePath
            )
            val modelConfig = OfflineTtsModelConfig(
                kokoro = kokoroConfig,
                numThreads = 2,
                provider = "cpu"
            )
            val ttsConfig = OfflineTtsConfig(
                model = modelConfig,
                maxNumSentences = 100
            )
            val engine = OfflineTts(config = ttsConfig)
            kokoro = engine
            engine
        } catch (_: Exception) {
            kokoroFailed = true
            null
        }
    }

    private fun prepareKokoroModelDir(): File {
        val dir = File(appContext.filesDir, "kokoro-en")
        val marker = File(dir, ".ready_v12")
        if (marker.exists() && File(dir, "voices.bin").exists() && File(dir, "lexicon.txt").exists()) {
            return dir
        }
        dir.mkdirs()
        copyAssets("kokoro-en", dir)
        try { marker.createNewFile() } catch (_: Exception) {}
        return dir
    }

    private fun copyAssets(assetPath: String, targetDir: File) {
        val names = try { appContext.assets.list(assetPath) } catch (_: Exception) { null } ?: return
        for (name in names) {
            val src = if (assetPath.isEmpty()) name else "$assetPath/$name"
            val out = File(targetDir, name)
            val children = try { appContext.assets.list(src) } catch (_: Exception) { null }
            if (children != null && children.isNotEmpty()) {
                out.mkdirs()
                copyAssets(src, out)
            } else {
                try {
                    appContext.assets.open(src).use { input ->
                        FileOutputStream(out).use { output -> input.copyTo(output) }
                    }
                } catch (_: Exception) {}
            }
        }
    }

    private fun createStreamTrack(sampleRate: Int): AudioTrack {
        val minBuf = AudioTrack.getMinBufferSize(
            sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        return AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(minBuf.coerceAtLeast(64 * 1024))
            .build()
    }

    private fun floatToPcm16(samples: FloatArray): ShortArray {
        val pcm = ShortArray(samples.size)
        for (i in samples.indices) {
            pcm[i] = (samples[i].coerceIn(-1f, 1f) * 32767f).toInt().toShort()
        }
        return pcm
    }

    // ---------- Engine 2: Rime Cloud API (coda / mistv3) + SHA-256 WAV Cache ----------

    private fun playRimeSequence(
        sentences: List<String>,
        index: Int,
        rate: Float,
        loopSingle: Boolean,
        cfg: SpeechConfig,
        token: Int,
        onSentenceStart: (Int) -> Unit,
        onComplete: () -> Unit
    ) {
        if (token != currentToken.get() || index >= sentences.size) {
            if (token == currentToken.get()) mainHandler.post { onComplete() }
            return
        }
        val speedAlpha = 1.0f / rate.coerceIn(0.6f, 1.8f)

        // Prefetch next sentence into SHA-256 cache in background
        if (!loopSingle && index + 1 < sentences.size) {
            bgScope.launch {
                try { rimeSynthesize(cfg.rimeModel, cfg.rimeSpeaker, speedAlpha, sentences[index + 1], cfg.rimeApiKey) } catch (_: Exception) {}
            }
        }

        val wav = try {
            rimeSynthesize(cfg.rimeModel, cfg.rimeSpeaker, speedAlpha, sentences[index], cfg.rimeApiKey)
        } catch (_: Exception) {
            null
        }

        if (token != currentToken.get()) return
        if (wav == null) {
            // Smooth fallback to Offline Kokoro
            bgScope.launch {
                playKokoroSequence(sentences, index, rate, loopSingle, cfg, token, onSentenceStart, onComplete)
            }
            return
        }

        mainHandler.post {
            if (token != currentToken.get()) return@post
            onSentenceStart(index)
            playWavOnMainThread(wav) {
                if (token != currentToken.get()) return@playWavOnMainThread
                val nextIdx = if (loopSingle) index else index + 1
                if (nextIdx >= sentences.size) {
                    onComplete()
                } else {
                    bgScope.launch {
                        playRimeSequence(sentences, nextIdx, rate, loopSingle, cfg, token, onSentenceStart, onComplete)
                    }
                }
            }
        }
    }

    private fun rimeSynthesize(
        model: String,
        speaker: String,
        speedAlpha: Float,
        text: String,
        apiKey: String
    ): File? {
        val speedText = String.format(Locale.US, "%.3f", speedAlpha)
        val cacheKey = sha256Hex("$model|$speaker|$speedText|$text")
        val cacheDir = File(appContext.cacheDir, "tts_cache").apply { mkdirs() }
        val cached = File(cacheDir, "$cacheKey.wav")
        if (cached.exists() && cached.length() > 0) return cached

        val host = if (model == "mistv3") "https://mist.api.rime.ai/" else "https://coda.api.rime.ai/"
        val conn = URL(host).openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Authorization", "Bearer ${apiKey.trim()}")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("Accept", "audio/wav")
        conn.connectTimeout = 15000
        conn.readTimeout = 45000
        conn.doOutput = true
        val body = JSONObject().apply {
            put("speaker", speaker)
            put("text", text)
            put("samplingRate", 24000)
            put("speedAlpha", speedAlpha)
        }.toString()
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        if (conn.responseCode != HttpURLConnection.HTTP_OK) return null
        conn.inputStream.use { input ->
            FileOutputStream(cached).use { output -> input.copyTo(output) }
        }
        return if (cached.exists() && cached.length() > 0) cached else null
    }

    private fun playWavOnMainThread(wav: File, onDone: () -> Unit) {
        try {
            val mp = MediaPlayer()
            synchronized(playLock) {
                mediaPlayer?.release()
                mediaPlayer = mp
            }
            mp.setDataSource(wav.absolutePath)
            mp.setOnCompletionListener {
                synchronized(playLock) { if (mediaPlayer === mp) mediaPlayer = null }
                try { mp.release() } catch (_: Exception) {}
                onDone()
            }
            mp.setOnErrorListener { _, _, _ ->
                synchronized(playLock) { if (mediaPlayer === mp) mediaPlayer = null }
                try { mp.release() } catch (_: Exception) {}
                onDone()
                true
            }
            mp.prepare()
            mp.start()
        } catch (_: Exception) {
            onDone()
        }
    }

    fun fetchRimeVoices(model: String, callback: (List<String>) -> Unit) {
        bgScope.launch {
            val list = try {
                val conn = URL("https://users.rime.ai/data/voices/all-v2.json").openConnection() as HttpURLConnection
                conn.connectTimeout = 10000
                conn.readTimeout = 15000
                val json = conn.inputStream.bufferedReader().use { it.readText() }
                val arr: JSONArray = JSONObject(json).getJSONObject(model).getJSONArray("eng")
                List(arr.length()) { arr.getString(it) }
            } catch (_: Exception) {
                listOf("astra", "celeste", "mesa", "marsh", "cove", "orion")
            }
            mainHandler.post { callback(list) }
        }
    }

    fun audioCacheSizeBytes(): Long {
        val dir = File(appContext.cacheDir, "tts_cache")
        if (!dir.exists()) return 0L
        return try { dir.walkTopDown().filter { it.isFile }.sumOf { it.length() } } catch (_: Exception) { 0L }
    }

    fun clearAudioCache(): Boolean {
        return try { File(appContext.cacheDir, "tts_cache").deleteRecursively() } catch (_: Exception) { false }
    }

    // ---------- Fallback: System Android TTS ----------

    private fun playSystemSequence(
        sentences: List<String>,
        index: Int,
        rate: Float,
        loopSingle: Boolean,
        token: Int,
        onSentenceStart: (Int) -> Unit,
        onComplete: () -> Unit
    ) {
        mainHandler.post {
            if (token != currentToken.get() || index >= sentences.size || !sysTtsReady) {
                if (token == currentToken.get()) onComplete()
                return@post
            }
            onSentenceStart(index)
            val utteranceId = UUID.randomUUID().toString()
            sysTts?.setSpeechRate(rate)
            sysTts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(id: String?) {}
                override fun onDone(id: String?) {
                    if (id == utteranceId && token == currentToken.get()) {
                        val nextIdx = if (loopSingle) index else index + 1
                        if (nextIdx >= sentences.size) {
                            mainHandler.post { onComplete() }
                        } else {
                            playSystemSequence(sentences, nextIdx, rate, loopSingle, token, onSentenceStart, onComplete)
                        }
                    }
                }
                @Deprecated("Deprecated in Java")
                override fun onError(id: String?) {
                    if (id == utteranceId && token == currentToken.get()) {
                        mainHandler.post { onComplete() }
                    }
                }
            })
            val params = Bundle().apply { putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId) }
            sysTts?.speak(sentences[index], TextToSpeech.QUEUE_FLUSH, params, utteranceId)
        }
    }

    private fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}
