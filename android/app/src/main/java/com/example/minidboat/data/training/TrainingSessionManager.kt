package com.example.minidboat.data.training

import android.content.Context
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.training.BoatLiveTrainingSession
import com.example.minidboat.training.StrokeAccelAxisMode
import com.example.minidboat.training.StrokeGpsPreferences
import com.example.minidboat.training.TrainingLiveMetrics
import com.example.minidboat.training.hasLocationPermission as trainingHasLocationPermission
import com.example.minidboat.viewmodel.LibreSessionDataPoint

/**
 * Encapsula [BoatLiveTrainingSession] y el registro de data-points por segundo.
 *
 * Responsabilidades:
 *  - Delegar GPS, acelerómetro y cálculos físicos a [BoatLiveTrainingSession].
 *  - Mantener la lista de [LibreSessionDataPoint] grabados durante la sesión.
 *  - Proveer la lógica de [snapCompetenciaDistancesToTarget] (ajuste de distancias al final de una competencia).
 *
 * El ViewModel coordina el estado de UI y la persistencia; este manager no sabe nada de esos detalles.
 *
 * @param appContext Contexto de aplicación (applicationContext). No se guarda como campo mutable;
 *   se pasa como parámetro en las llamadas que lo necesitan.
 */
class TrainingSessionManager(
    val appContext: Context,
    onLiveMetricsChanged: (TrainingLiveMetrics) -> Unit,
    onAfterLocationApplied: () -> Unit = {},
    sessionActive: () -> Boolean,
) {

    private val sessionDataPoints = mutableListOf<LibreSessionDataPoint>()

    val live: BoatLiveTrainingSession = BoatLiveTrainingSession(
        sessionActive = sessionActive,
        onLiveMetricsChanged = onLiveMetricsChanged,
        onAfterLocationApplied = onAfterLocationApplied,
    )

    // ── Permisos ────────────────────────────────────────────────────────────────

    fun hasLocationPermission(context: Context): Boolean =
        trainingHasLocationPermission(context.applicationContext)

    // ── Preferencias de entrenamiento ───────────────────────────────────────────

    fun buildTrainingPrefs(context: Context): StrokeGpsPreferences = StrokeGpsPreferences(
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

    // ── Ciclo de vida de la sesión ──────────────────────────────────────────────

    fun prepareFreshSession(context: Context) {
        sessionDataPoints.clear()
        live.prepareFreshSessionStart()
        live.setPreferences(buildTrainingPrefs(context))
    }

    fun resumeSession(context: Context) {
        live.clearStrokeBuffersOnly()
        live.setPreferences(buildTrainingPrefs(context))
    }

    fun startLocationAndSensor(context: Context) {
        live.startLocationUpdates(context)
        live.startSensor(context)
    }

    fun stopLocationAndSensor() {
        live.stopSensor()
        live.stopLocationUpdates()
    }

    fun resetAllMeasurementState() {
        live.resetAllMeasurementState()
    }

    fun resetMetricsForNextExercise() {
        live.resetMetricsForNextExercise()
    }

    fun release() {
        live.release()
    }

    // ── Data points ─────────────────────────────────────────────────────────────

    /**
     * Agrega un data-point en el segundo [second] con las métricas actuales provistas por [currentState].
     * Llama a [BoatLiveTrainingSession.drainStrokePeaksMaxSinceLastDataPoint] para consumir los picos.
     */
    fun addDataPoint(
        second: Long,
        distanceMeters: Float,
        speedKmh: Float,
        paladas: Int,
        spm: Int,
        dpsMeters: Float,
    ) {
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
                distanceMeters = distanceMeters,
                speedKmh = speedKmh,
                paladas = paladas,
                spm = spm,
                dpsMeters = dpsMeters,
                latitude = lat,
                longitude = lon,
                locationAccuracyM = acc,
                strokePeakAccelerationMs2 = live.drainStrokePeaksMaxSinceLastDataPoint(),
            )
        )
    }

    fun clearDataPoints() {
        sessionDataPoints.clear()
    }

    fun getDataPoints(): List<LibreSessionDataPoint> = sessionDataPoints.toList()

    fun hasDataPoints(): Boolean = sessionDataPoints.isNotEmpty()

    fun maxSecond(): Long = sessionDataPoints.maxOfOrNull { it.second } ?: 0L

    // ── Competencia ─────────────────────────────────────────────────────────────

    /**
     * Escala las distancias de todos los data-points al target exacto para evitar que el GPS
     * supere o quede corto de la meta oficial al guardar el JSON de competencia.
     */
    fun snapCompetenciaDistancesToTarget(targetMeters: Float) {
        if (sessionDataPoints.isEmpty() || targetMeters <= 0f) return
        val rawMax = sessionDataPoints.maxOf { it.distanceMeters }
        if (rawMax <= 0f) return
        val scale = targetMeters / rawMax
        for (i in sessionDataPoints.indices) {
            val p = sessionDataPoints[i]
            sessionDataPoints[i] = p.copy(
                distanceMeters = (p.distanceMeters * scale).coerceIn(0f, targetMeters),
            )
        }
        val li = sessionDataPoints.lastIndex
        val last = sessionDataPoints[li]
        sessionDataPoints[li] = last.copy(distanceMeters = targetMeters)
    }
}
