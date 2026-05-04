package com.example.minidboat.viewmodel



import android.content.Context

import androidx.lifecycle.ViewModel

import androidx.lifecycle.viewModelScope

import kotlinx.coroutines.Dispatchers

import kotlinx.coroutines.Job

import kotlinx.coroutines.delay

import kotlinx.coroutines.launch

import kotlinx.coroutines.withContext

import kotlinx.coroutines.flow.MutableStateFlow

import kotlinx.coroutines.flow.StateFlow

import kotlinx.coroutines.flow.asStateFlow

import kotlinx.coroutines.isActive

import com.example.minidboat.MiniDBoatApplication

import com.example.minidboat.R

import com.example.minidboat.data.AppPreferences

import com.example.minidboat.training.BoatLiveTrainingSession

import com.example.minidboat.training.StrokeAccelAxisMode
import com.example.minidboat.training.StrokeGpsPreferences

import com.example.minidboat.training.hasLocationPermission as trainingHasLocationPermission

import java.io.File

import org.json.JSONObject

import java.time.Instant

import java.time.ZoneId

import java.time.format.DateTimeFormatter

import java.util.Locale

import kotlin.jvm.Volatile



/** Punto de datos grabado cada segundo durante la sesión Libre */

data class LibreSessionDataPoint(

    val second: Long,

    val distanceMeters: Float,

    val speedKmh: Float,

    val paladas: Int,

    val spm: Int,

    /** Metros por palada (DPS) en vivo al segundo; 0 si no aplica. */
    val dpsMeters: Float = 0f,

    /** WGS84; null si aún no hubo fix GPS en ese segundo. */

    val latitude: Double? = null,

    val longitude: Double? = null,

    val locationAccuracyM: Float? = null,

    /**
     * Máximo |aceleración| del eje configurado (Pantalla parada = Z / Pantalla acostada = vertical en pantalla) por palada(s) en el intervalo de 1 s.
     * Varios golpes en el mismo segundo: máximo entre picos. Null si no hubo palada en ese intervalo.
     */
    val strokePeakAccelerationMs2: Float? = null,

)



/** Estructura JSON de la sesión Libre completa */

data class LibreSessionJson(

    val sessionStartTime: String,

    val totalSeconds: Long,

    val dataPoints: List<LibreSessionDataPoint>,

    /** Copiados de Configuración al grabar; null en JSON antiguos. */

    val teamName: String? = null,

    val boatType: String? = null,

    val paddlersCount: Int? = null,

    /** Máximo |aceleración| (m/s²) del eje elegido por cada palada, en orden. Null en JSON viejos. */
    val strokePeakAccelerationsMs2: List<Double>? = null,

)



/** Línea “equipo · bote · n palistas” usando datos guardados en el JSON o preferencias si faltan. */

fun LibreSessionJson.metadataLine(context: Context): String {

    val team = teamName?.takeIf { it.isNotBlank() } ?: AppPreferences.getTeamDisplayForSession(context)

    val boatStored = boatType?.takeIf {

        it == AppPreferences.BOAT_TYPE_GRANDE || it == AppPreferences.BOAT_TYPE_CHICO

    } ?: AppPreferences.getBoatType(context)

    val boatLabel = when (boatStored) {

        AppPreferences.BOAT_TYPE_GRANDE -> context.getString(R.string.boat_grande)

        else -> context.getString(R.string.boat_chico)

    }

    val n = (paddlersCount ?: AppPreferences.getPaddlersCount(context)).coerceIn(1, 20)

    val paddlers = context.getString(R.string.paddlers_count_lbl, n)

    return "$team · $boatLabel · $paddlers"

}



data class LibreState(

    val isStarted: Boolean = false,

    val isPaused: Boolean = false,

    val elapsedSeconds: Long = 0L,

    val distanceMeters: Float = 0f,

    val speedMps: Float = 0f,

    val paladas: Int = 0,

    val spm: Int = 0,

    val sessionTotalSeconds: Long = 0L,

    val sessionTotalDistanceM: Float = 0f,

    val sessionTotalPaladas: Int = 0,

    val sessionMaxSpeedMps: Float = 0f,

    val sessionTotalElapsedSeconds: Long = 0L,

    /** Promedio de metros por palada (últimas N paladas según configuración DPS). */

    val dpsMeters: Float = 0f,

    /** Competencia: meta alcanzada; listo para enviar con “Completado”. */

    val competenciaAwaitingSubmit: Boolean = false,

) {

    val distanceKm: Float get() = distanceMeters / 1000f

    val speedKmh: Float get() = speedMps * 3.6f

}



class LibreViewModel : ViewModel() {



    private val _state = MutableStateFlow(LibreState())

    val state: StateFlow<LibreState> = _state.asStateFlow()



    private var timerJob: Job? = null

    private val sessionDataPoints = mutableListOf<LibreSessionDataPoint>()

    private var appContext: Context? = null



    private var sessionStartTime: Long = 0L

    private var sessionStartTimeForJson: String = ""



    private var isCompetenciaMode: Boolean = false

    private var competenciaTargetMeters: Float = 500f

    @Volatile

    private var competenciaRaceEnded: Boolean = false



    private val live: BoatLiveTrainingSession



    init {

        live = BoatLiveTrainingSession(

            sessionActive = { !_state.value.isPaused && _state.value.isStarted },

            onLiveMetricsChanged = { m ->

                _state.value = _state.value.copy(

                    distanceMeters = m.distanceMeters,

                    speedMps = m.speedMps,

                    sessionMaxSpeedMps = m.sessionMaxSpeedMps,

                    paladas = m.paladas,

                    spm = m.spm,

                    dpsMeters = m.dpsMeters,

                )

            },

            onAfterLocationApplied = { tryFinishCompetenciaIfNeeded() },

        )

    }



    private fun trainingPrefs(context: Context) = StrokeGpsPreferences(

        speedSmoothSamples = AppPreferences.getSpeedSmoothSamples(context),

        strokeMinIntervalMs = AppPreferences.getStrokeMinIntervalMs(context).toLong(),

        spmIntervals = AppPreferences.getSpmIntervals(context),

        dpsStrokeWindow = AppPreferences.getDpsStrokeWindow(context),

        strokeAccelAxisMode = if (AppPreferences.getStrokeAccelAxisIsLandscape(context)) {
            StrokeAccelAxisMode.LANDSCAPE
        } else {
            StrokeAccelAxisMode.PORTRAIT
        },

        strokeSensitivity = AppPreferences.getStrokeSensitivity(context),

    )



    fun hasLocationPermission(context: Context): Boolean =

        trainingHasLocationPermission(context.applicationContext)



    fun resetSessionTotals() {

        sessionStartTime = System.currentTimeMillis()

        _state.value = _state.value.copy(

            sessionTotalSeconds = 0L,

            sessionTotalDistanceM = 0f,

            sessionTotalPaladas = 0,

            sessionMaxSpeedMps = 0f,

            sessionTotalElapsedSeconds = 0L

        )

    }



    fun finalizeSession() {

        val elapsed = (System.currentTimeMillis() - sessionStartTime) / 1000

        _state.value = _state.value.copy(sessionTotalElapsedSeconds = elapsed)

    }



    fun start(context: Context) {

        if (_state.value.isStarted && !_state.value.isPaused) return

        val freshSession = !_state.value.isStarted

        sessionStartTime = System.currentTimeMillis()

        appContext = context.applicationContext

        sessionDataPoints.clear()

        if (freshSession) {

            live.prepareFreshSessionStart()

        } else {

            live.clearStrokeBuffersOnly()

        }

        live.setPreferences(trainingPrefs(context))

        sessionStartTimeForJson = DateTimeFormatter.ISO_LOCAL_DATE_TIME

            .withZone(ZoneId.systemDefault())

            .format(Instant.ofEpochMilli(sessionStartTime))

        // Sesión activa antes de registrar GPS para que sessionActive() coincida con el acumulado de distancia.
        _state.value = if (freshSession) {

            _state.value.copy(

                isStarted = true,

                isPaused = false,

                elapsedSeconds = 0L,

                distanceMeters = 0f,

                speedMps = 0f,

                paladas = 0,

                spm = 0,

                dpsMeters = 0f,

                competenciaAwaitingSubmit = false,

                sessionMaxSpeedMps = 0f,

            )

        } else {

            _state.value.copy(

                isStarted = true,

                isPaused = false,

                dpsMeters = 0f,

                competenciaAwaitingSubmit = false,

            )

        }

        live.startLocationUpdates(context)

        live.startSensor(context)

        addDataPoint(0L)

        startTimer()

    }



    fun pause() {

        _state.value = _state.value.copy(isPaused = true)

        timerJob?.cancel()

        live.stopSensor()

        live.stopLocationUpdates()

        if (!isCompetenciaMode) {

            saveSessionToJson()

        }

    }



    fun resume(context: Context) {

        live.setPreferences(trainingPrefs(context))

        _state.value = _state.value.copy(isPaused = false)

        startTimer()

        live.startLocationUpdates(context)

        live.startSensor(context)

    }



    fun reset() {

        if (!_state.value.isPaused && _state.value.isStarted && !isCompetenciaMode) {

            saveSessionToJson()

        }

        timerJob?.cancel()

        live.stopSensor()

        live.stopLocationUpdates()

        live.resetAllMeasurementState()

        isCompetenciaMode = false

        competenciaRaceEnded = false

        competenciaTargetMeters = 500f

        _state.value = LibreState()

    }



    /**

     * Llamar al abrir la pantalla de competencia (antes de la cuenta regresiva).

     * No guarda sesión; deja el estado listo para [start].

     */

    fun configureForCompetencia(context: Context) {

        timerJob?.cancel()

        live.stopSensor()

        live.stopLocationUpdates()

        live.resetAllMeasurementState()

        appContext = context.applicationContext

        isCompetenciaMode = true

        competenciaRaceEnded = false

        competenciaTargetMeters = AppPreferences.getCompetenciaDistanceMeters(context).toFloat()

        sessionStartTimeForJson = ""

        _state.value = LibreState()

    }



    fun submitCompetenciaSession(

        context: Context,

        onFinished: (CompetenciaSubmitOutcome) -> Unit,

    ) {

        if (!_state.value.competenciaAwaitingSubmit) return

        val ctx = context.applicationContext

        viewModelScope.launch(Dispatchers.IO) {

            val app = ctx.applicationContext as? MiniDBoatApplication

            if (app != null && AppPreferences.isCloudLoggedIn(ctx)) {

                try {

                    app.cloudRepository.refreshCachedTeamFromApi()

                } catch (_: Exception) {

                }

            }

            val json = buildCompetenciaSessionJsonString(ctx)

            if (json.isNullOrBlank()) {

                withContext(Dispatchers.Main) {

                    onFinished(CompetenciaSubmitOutcome.Error("No hay datos de sesión para guardar."))

                }

                return@launch

            }

            val fileName = "competencia_session_${System.currentTimeMillis()}.json"

            val file = File(ctx.filesDir, fileName)

            try {

                file.writeText(json)

            } catch (e: Exception) {

                withContext(Dispatchers.Main) {

                    onFinished(CompetenciaSubmitOutcome.Error("No se pudo guardar en el teléfono: ${e.message}"))

                }

                return@launch

            }

            val outcome: CompetenciaSubmitOutcome = when {

                app == null -> {

                    AppPreferences.addPendingCompetenciaFile(ctx, fileName)

                    CompetenciaSubmitOutcome.SavedPendingUpload("No se pudo acceder a la aplicación.")

                }

                !AppPreferences.isCloudLoggedIn(ctx) -> {

                    AppPreferences.addPendingCompetenciaFile(ctx, fileName)

                    CompetenciaSubmitOutcome.SavedPendingUpload("No hay sesión en la nube. Iniciá sesión y reenviá desde Configuración.")

                }

                else -> {

                    val result = app.cloudRepository.uploadCompetenciaSessionWithResult(json)

                    if (result.isSuccess) {

                        AppPreferences.removePendingCompetenciaFile(ctx, fileName)

                        try {

                            file.delete()

                        } catch (_: Exception) {

                        }

                        CompetenciaSubmitOutcome.Uploaded

                    } else {

                        AppPreferences.addPendingCompetenciaFile(ctx, fileName)

                        val err = result.exceptionOrNull()?.message ?: "Error de red"

                        CompetenciaSubmitOutcome.SavedPendingUpload(err)

                    }

                }

            }

            reset()

            withContext(Dispatchers.Main) {

                onFinished(outcome)

            }

        }

    }



    private fun snapCompetenciaDistancesToTarget() {

        val target = competenciaTargetMeters

        if (sessionDataPoints.isEmpty() || target <= 0f) return

        val rawMax = sessionDataPoints.maxOf { it.distanceMeters }

        if (rawMax <= 0f) return

        val scale = target / rawMax

        for (i in sessionDataPoints.indices) {

            val p = sessionDataPoints[i]

            sessionDataPoints[i] = p.copy(

                distanceMeters = (p.distanceMeters * scale).coerceIn(0f, target),

            )

        }

        val li = sessionDataPoints.lastIndex

        val last = sessionDataPoints[li]

        sessionDataPoints[li] = last.copy(distanceMeters = target)

    }



    private fun tryFinishCompetenciaIfNeeded() {

        if (!isCompetenciaMode || competenciaRaceEnded) return

        val s = _state.value

        if (!s.isStarted || s.isPaused || s.competenciaAwaitingSubmit) return

        if (s.distanceMeters + 0.25f >= competenciaTargetMeters) {

            competenciaRaceEnded = true

            timerJob?.cancel()

            live.stopSensor()

            live.stopLocationUpdates()

            snapCompetenciaDistancesToTarget()

            _state.value = s.copy(

                isPaused = true,

                competenciaAwaitingSubmit = true,

                distanceMeters = competenciaTargetMeters,

            )

        }

    }



    fun addToSessionTotals(seconds: Long, distanceM: Float, paladas: Int) {

        _state.value = _state.value.copy(

            sessionTotalSeconds = _state.value.sessionTotalSeconds + seconds,

            sessionTotalDistanceM = _state.value.sessionTotalDistanceM + distanceM,

            sessionTotalPaladas = _state.value.sessionTotalPaladas + paladas

        )

    }



    fun getSessionDataForChart(): List<LibreSessionDataPoint>? {

        if (sessionDataPoints.isEmpty()) return null

        return sessionDataPoints.toList()

    }



    fun getSessionStartIsoForShare(): String = sessionStartTimeForJson



    fun resetForNextExercise() {

        timerJob?.cancel()

        live.resetMetricsForNextExercise()

        _state.value = _state.value.copy(

            elapsedSeconds = 0L,

            distanceMeters = 0f,

            paladas = 0,

            spm = 0,

            dpsMeters = 0f,

        )

        if (_state.value.isStarted && !_state.value.isPaused) {

            startTimer()

        }

    }



    private fun startTimer() {

        timerJob?.cancel()

        val startSeconds = _state.value.elapsedSeconds

        timerJob = viewModelScope.launch {

            var count = startSeconds

            while (isActive) {

                delay(1000L)

                count++

                _state.value = _state.value.copy(elapsedSeconds = count)

                addDataPoint(count)

                tryFinishCompetenciaIfNeeded()

            }

        }

    }



    private fun addDataPoint(second: Long) {

        val s = _state.value

        val loc = live.lastKnownLocation()

        var lat: Double? = null

        var lon: Double? = null

        var acc: Float? = null

        if (loc != null) {

            val la = loc.latitude

            val lo = loc.longitude

            if (la.isFinite() && lo.isFinite() && !(la == 0.0 && lo == 0.0)) {

                lat = la

                lon = lo

                if (loc.hasAccuracy()) acc = loc.accuracy

            }

        }

        sessionDataPoints.add(

            LibreSessionDataPoint(

                second = second,

                distanceMeters = s.distanceMeters,

                speedKmh = s.speedKmh,

                paladas = s.paladas,

                spm = s.spm,

                dpsMeters = s.dpsMeters,

                latitude = lat,

                longitude = lon,

                locationAccuracyM = acc,

                strokePeakAccelerationMs2 = live.drainStrokePeaksMaxSinceLastDataPoint(),

            )

        )

    }



    /** En JSON, tiempos y kmh/DPS con 2 decimales; la UI usa otros formatos. */
    private fun jsonSecondsField2(sec: Long): String =
        String.format(Locale.US, "%.2f", sec.toDouble())

    private fun jsonFloatField2(f: Float): String =
        String.format(Locale.US, "%.2f", f.toDouble())

    private fun libreDataPointToJson(p: LibreSessionDataPoint): String {

        val lat = p.latitude?.let { String.format(Locale.US, "%.8f", it) } ?: "null"

        val lon = p.longitude?.let { String.format(Locale.US, "%.8f", it) } ?: "null"

        val acc = p.locationAccuracyM?.let { String.format(Locale.US, "%.6f", it) } ?: "null"

        val dm = String.format(Locale.US, "%.15g", p.distanceMeters.toDouble())

        val sec = jsonSecondsField2(p.second)

        val sk = jsonFloatField2(p.speedKmh)

        val peak =
            p.strokePeakAccelerationMs2?.let { String.format(Locale.US, "%.15g", it.toDouble()) } ?: "null"

        val dps = jsonFloatField2(p.dpsMeters)

        return "{\"second\":$sec,\"distanceMeters\":$dm,\"speedKmh\":$sk,\"paladas\":${p.paladas},\"spm\":${p.spm},\"dpsMeters\":$dps,\"latitude\":$lat,\"longitude\":$lon,\"locationAccuracyM\":$acc,\"strokePeakAccelerationMs2\":$peak}"

    }



    private fun buildLibreSessionJsonString(

        totalSeconds: Long,

        points: List<LibreSessionDataPoint>,

        teamName: String?,

        boatType: String?,

        paddlersCount: Int?,

    ): String {

        val dataPointsJson = points.joinToString(",", transform = ::libreDataPointToJson)

        val tn = teamName?.let { JSONObject.quote(it) } ?: "null"

        val bt = boatType?.let { JSONObject.quote(it) } ?: "null"

        val pc = paddlersCount?.toString() ?: "null"

        val totalSecJson = jsonSecondsField2(totalSeconds)

        return "{\"sessionStartTime\":${JSONObject.quote(sessionStartTimeForJson)},\"totalSeconds\":$totalSecJson,\"dataPoints\":[$dataPointsJson],\"teamName\":$tn,\"boatType\":$bt,\"paddlersCount\":$pc}"

    }



    private fun buildCompetenciaSessionJsonString(ctx: Context): String? {

        if (sessionDataPoints.isEmpty()) return null

        val totalSeconds = sessionDataPoints.maxOfOrNull { it.second } ?: 0L

        val dataPointsJson = sessionDataPoints.joinToString(",", transform = ::libreDataPointToJson)

        val team = AppPreferences.getTeamDisplayForSession(ctx)

        val teamCountry = AppPreferences.getCachedApiTeamCountry(ctx)

        val boat = AppPreferences.getCompetenciaBoatType(ctx)

        val paddlers = AppPreferences.getCompetenciaPaddlers(ctx)

        val target = AppPreferences.getCompetenciaDistanceMeters(ctx)

        val virada = AppPreferences.getCompetenciaVirada(ctx)

        val drummer = AppPreferences.getCompetenciaDrummer(ctx)

        val age = AppPreferences.getCompetenciaAgeCategory(ctx)

        val teamCat = AppPreferences.getCompetenciaTeamType(ctx)

        return buildString {

            append("{\"sessionKind\":\"competencia\",")

            append("\"sessionStartTime\":").append(JSONObject.quote(sessionStartTimeForJson)).append(',')

            append("\"totalSeconds\":").append(jsonSecondsField2(totalSeconds)).append(',')

            append("\"dataPoints\":[").append(dataPointsJson).append("],")

            append("\"teamName\":").append(JSONObject.quote(team)).append(',')

            append("\"teamCountry\":").append(

                if (teamCountry.isNullOrBlank()) "null" else JSONObject.quote(teamCountry)

            ).append(',')

            append("\"boatType\":").append(JSONObject.quote(boat)).append(',')

            append("\"paddlersCount\":").append(paddlers).append(',')

            append("\"targetDistanceMeters\":").append(target).append(',')

            append("\"virada\":").append(if (virada) "true" else "false").append(',')

            append("\"drummer\":").append(if (drummer) "true" else "false").append(',')

            append("\"ageCategory\":").append(JSONObject.quote(age)).append(',')

            append("\"teamCategory\":").append(JSONObject.quote(teamCat))

            append('}')

        }

    }



    private fun saveSessionToJson() {

        val ctx = appContext ?: return

        if (sessionDataPoints.isEmpty()) return

        val totalSeconds = sessionDataPoints.maxOfOrNull { it.second } ?: 0L

        val jsonString = buildLibreSessionJsonString(

            totalSeconds,

            sessionDataPoints.toList(),

            AppPreferences.getTeamDisplayForSession(ctx),

            AppPreferences.getBoatType(ctx),

            AppPreferences.getPaddlersCount(ctx),

        )

        try {

            val fileName = "libre_session_${System.currentTimeMillis()}.json"

            val file = File(ctx.filesDir, fileName)

            file.writeText(jsonString)

            val app = ctx.applicationContext as? MiniDBoatApplication

            if (app != null) {

                viewModelScope.launch(Dispatchers.IO) {

                    app.cloudRepository.uploadLibreSessionIfSignedIn(jsonString)

                }

            }

        } catch (_: Exception) {}

    }



    override fun onCleared() {

        super.onCleared()

        live.release()

    }

}

