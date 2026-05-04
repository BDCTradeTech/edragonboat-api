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
import com.example.minidboat.data.SessionRepository
import com.example.minidboat.data.training.TrainingSessionManager
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
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
     * Máximo |aceleración| del eje configurado por palada(s) en el intervalo de 1 s.
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



/** Línea "equipo · bote · n palistas" usando datos guardados en el JSON o preferencias si faltan. */
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
    /** Competencia: meta alcanzada; listo para enviar con "Completado". */
    val competenciaAwaitingSubmit: Boolean = false,
) {
    val distanceKm: Float get() = distanceMeters / 1000f
    val speedKmh: Float get() = speedMps * 3.6f
}



class LibreViewModel : ViewModel() {

    private val _state = MutableStateFlow(LibreState())
    val state: StateFlow<LibreState> = _state.asStateFlow()

    private var timerJob: Job? = null

    private var sessionStartTime: Long = 0L
    private var sessionStartTimeForJson: String = ""

    private var isCompetenciaMode: Boolean = false
    private var competenciaTargetMeters: Float = 500f
    @Volatile
    private var competenciaRaceEnded: Boolean = false

    // Inicializados con placeholders; se reemplazan en start() / configureForCompetencia()
    // con el applicationContext real. Se usan lateinit-style a través de Context parameters.
    private lateinit var sessionManager: TrainingSessionManager
    private lateinit var sessionRepository: SessionRepository

    // ── Coordinación de métricas en vivo ────────────────────────────────────────

    private fun initDependencies(context: Context) {
        val appCtx = context.applicationContext
        if (!::sessionManager.isInitialized) {
            sessionManager = TrainingSessionManager(
                appContext = appCtx,
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
        if (!::sessionRepository.isInitialized) {
            sessionRepository = SessionRepository(appCtx)
        }
    }

    // ── API pública de permisos ──────────────────────────────────────────────────

    fun hasLocationPermission(context: Context): Boolean =
        if (::sessionManager.isInitialized) {
            sessionManager.hasLocationPermission(context)
        } else {
            com.example.minidboat.training.hasLocationPermission(context.applicationContext)
        }

    // ── Totales de sesión ────────────────────────────────────────────────────────

    fun resetSessionTotals() {
        sessionStartTime = System.currentTimeMillis()
        _state.value = _state.value.copy(
            sessionTotalSeconds = 0L,
            sessionTotalDistanceM = 0f,
            sessionTotalPaladas = 0,
            sessionMaxSpeedMps = 0f,
            sessionTotalElapsedSeconds = 0L,
        )
    }

    fun finalizeSession() {
        val elapsed = (System.currentTimeMillis() - sessionStartTime) / 1000
        _state.value = _state.value.copy(sessionTotalElapsedSeconds = elapsed)
    }

    fun addToSessionTotals(seconds: Long, distanceM: Float, paladas: Int) {
        _state.value = _state.value.copy(
            sessionTotalSeconds = _state.value.sessionTotalSeconds + seconds,
            sessionTotalDistanceM = _state.value.sessionTotalDistanceM + distanceM,
            sessionTotalPaladas = _state.value.sessionTotalPaladas + paladas,
        )
    }

    // ── Ciclo de vida principal ──────────────────────────────────────────────────

    fun start(context: Context) {
        if (_state.value.isStarted && !_state.value.isPaused) return
        initDependencies(context)

        val freshSession = !_state.value.isStarted
        sessionStartTime = System.currentTimeMillis()
        sessionStartTimeForJson = DateTimeFormatter.ISO_LOCAL_DATE_TIME
            .withZone(ZoneId.systemDefault())
            .format(Instant.ofEpochMilli(sessionStartTime))

        if (freshSession) {
            sessionManager.prepareFreshSession(context)
        } else {
            sessionManager.resumeSession(context)
        }

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

        sessionManager.startLocationAndSensor(context)
        addDataPoint(0L)
        startTimer()
    }

    fun pause() {
        _state.value = _state.value.copy(isPaused = true)
        timerJob?.cancel()
        sessionManager.stopLocationAndSensor()
        if (!isCompetenciaMode) {
            saveSessionToJson()
        }
    }

    fun resume(context: Context) {
        initDependencies(context)
        sessionManager.live.setPreferences(sessionManager.buildTrainingPrefs(context))
        _state.value = _state.value.copy(isPaused = false)
        startTimer()
        sessionManager.startLocationAndSensor(context)
    }

    fun reset() {
        if (!_state.value.isPaused && _state.value.isStarted && !isCompetenciaMode) {
            saveSessionToJson()
        }
        timerJob?.cancel()
        if (::sessionManager.isInitialized) {
            sessionManager.stopLocationAndSensor()
            sessionManager.resetAllMeasurementState()
        }
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
        initDependencies(context)
        timerJob?.cancel()
        sessionManager.stopLocationAndSensor()
        sessionManager.resetAllMeasurementState()
        isCompetenciaMode = true
        competenciaRaceEnded = false
        competenciaTargetMeters = AppPreferences.getCompetenciaDistanceMeters(context).toFloat()
        sessionStartTimeForJson = ""
        _state.value = LibreState()
    }

    fun resetForNextExercise() {
        timerJob?.cancel()
        if (::sessionManager.isInitialized) {
            sessionManager.resetMetricsForNextExercise()
        }
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

    // ── Competencia: submit ──────────────────────────────────────────────────────

    fun submitCompetenciaSession(
        context: Context,
        onFinished: (CompetenciaSubmitOutcome) -> Unit,
    ) {
        if (!_state.value.competenciaAwaitingSubmit) return
        initDependencies(context)
        val ctx = context.applicationContext

        viewModelScope.launch(Dispatchers.IO) {
            val app = ctx.applicationContext as? MiniDBoatApplication
            if (app != null && AppPreferences.isCloudLoggedIn(ctx)) {
                try {
                    app.cloudRepository.refreshCachedTeamFromApi()
                } catch (_: Exception) {
                }
            }

            val json = sessionRepository.buildCompetenciaSessionJsonString(
                sessionStartTimeIso = sessionStartTimeForJson,
                points = sessionManager.getDataPoints(),
            )

            if (json.isNullOrBlank()) {
                withContext(Dispatchers.Main) {
                    onFinished(CompetenciaSubmitOutcome.Error("No hay datos de sesión para guardar."))
                }
                return@launch
            }

            val fileName: String
            try {
                fileName = sessionRepository.saveCompetenciaSession(json)
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
                    CompetenciaSubmitOutcome.SavedPendingUpload(
                        "No hay sesión en la nube. Iniciá sesión y reenviá desde Configuración."
                    )
                }
                else -> {
                    val result = app.cloudRepository.uploadCompetenciaSessionWithResult(json)
                    if (result.isSuccess) {
                        AppPreferences.removePendingCompetenciaFile(ctx, fileName)
                        sessionRepository.deleteSessionFile(fileName)
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

    // ── Datos para UI / compartir ────────────────────────────────────────────────

    fun getSessionDataForChart(): List<LibreSessionDataPoint>? {
        if (!::sessionManager.isInitialized) return null
        val points = sessionManager.getDataPoints()
        return if (points.isEmpty()) null else points
    }

    fun getSessionStartIsoForShare(): String = sessionStartTimeForJson

    // ── Lógica interna ───────────────────────────────────────────────────────────

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
        if (!::sessionManager.isInitialized) return
        val s = _state.value
        sessionManager.addDataPoint(
            second = second,
            distanceMeters = s.distanceMeters,
            speedKmh = s.speedKmh,
            paladas = s.paladas,
            spm = s.spm,
            dpsMeters = s.dpsMeters,
        )
    }

    private fun saveSessionToJson() {
        if (!::sessionManager.isInitialized || !::sessionRepository.isInitialized) return
        if (!sessionManager.hasDataPoints()) return
        try {
            sessionRepository.saveLibreSession(
                sessionStartTimeIso = sessionStartTimeForJson,
                points = sessionManager.getDataPoints(),
                onUpload = { json ->
                    val app = sessionManager.appContext.applicationContext as? MiniDBoatApplication
                    if (app != null) {
                        viewModelScope.launch(Dispatchers.IO) {
                            app.cloudRepository.uploadLibreSessionIfSignedIn(json)
                        }
                    }
                },
            )
        } catch (_: Exception) {
        }
    }

    private fun tryFinishCompetenciaIfNeeded() {
        if (!isCompetenciaMode || competenciaRaceEnded) return
        val s = _state.value
        if (!s.isStarted || s.isPaused || s.competenciaAwaitingSubmit) return
        if (s.distanceMeters + 0.25f >= competenciaTargetMeters) {
            competenciaRaceEnded = true
            timerJob?.cancel()
            sessionManager.stopLocationAndSensor()
            sessionManager.snapCompetenciaDistancesToTarget(competenciaTargetMeters)
            _state.value = s.copy(
                isPaused = true,
                competenciaAwaitingSubmit = true,
                distanceMeters = competenciaTargetMeters,
            )
        }
    }

    override fun onCleared() {
        super.onCleared()
        if (::sessionManager.isInitialized) {
            sessionManager.release()
        }
    }
}
