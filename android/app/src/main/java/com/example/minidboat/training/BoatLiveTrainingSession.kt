package com.example.minidboat.training

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.os.Build
import android.location.LocationListener
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import android.view.Display
import android.view.Surface
import android.view.WindowManager
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlin.jvm.Volatile
import kotlin.math.abs
import kotlin.math.hypot

/**
 * GPS (distancia, velocidad suavizada) + acelerómetro (paladas, SPM, DPS).
 * Una sola implementación para Libre, rutinas y Competencia; el ViewModel solo orquesta estado y persistencia.
 */
class BoatLiveTrainingSession(
    /** Sesión activa: no pausada y ya iniciada (según [LibreViewModel]). */
    private val sessionActive: () -> Boolean,
    /** Se invoca tras cada cambio de métricas en vivo. */
    private val onLiveMetricsChanged: (TrainingLiveMetrics) -> Unit,
    /** Tras aplicar un fix GPS (p. ej. comprobar meta de competencia). */
    private val onAfterLocationApplied: () -> Unit = {},
) {

    companion object {
        private const val STROKE_RESET_INTERVAL_MS = 5000L
        private const val ACCELERATION_THRESHOLD = 0.05f
        /** Si la componente perpendicular es ruido (~plano dominante), no exigir ratio. */
        private const val STROKE_PERP_COMPONENT_EPS_MS2 = 0.07f
        /** |eje elegido| debe superar |perpendicular| × ratio; obliga a alinear el gesto con un eje de pantalla. */
        private const val STROKE_SCREEN_AXIS_DOMINANCE_RATIO = 1.52f
        private const val STROKE_TIMES_TO_KEEP = 10
        private const val STROKE_DISTANCE_SEGMENTS_MAX = 32
        private const val SPEED_SMOOTH_MAX_SAMPLES = 6
        /**
         * Máx. metros aceptados en 1s real (todos los fixes GPS juntos), para no sumar
         * cientos de m por ráfagas 5–10 Hz, cada una con tope 100 m (→ ~268 m en 1 s).
         * ~10–12 m/s sitúa a ~36–43 km/h, más que razonable en agua; el GPS tarda en reflejar remada real.
         */
        private const val MAX_METERS_ADDED_PER_WALL_CLOCK_SECOND = 12f
        /** Tope duro por tramo (además de [maxBySpeed] por Δt de fix). */
        private const val MAX_METERS_PER_GPS_SEGMENT = 18f
        /** Mismo fix repetido: si luego un salto grande, probable “telepuerto” tras atasco de GPS. */
        private const val GPS_STUCK_RAW_METERS = 0.4f
        private const val GPS_STUCK_STEPS_TO_TELEPORT = 3
        private const val GPS_TELEPORT_RAW_MIN_METERS = 25f
        private const val GPS_TELEPORT_SEGMENT_CAP = 5f
        /** Mala precisión (m) → no confiar en saltos largos. */
        private const val GPS_ACCURACY_POOR_M = 20f
        private const val GPS_ACCURACY_BAD_M = 30f
    }

    private var distanceWallWindowStartMs: Long = 0L
    private var distanceAddedInWallWindow: Float = 0f
    private var consecutiveGpsStuck: Int = 0

    @Volatile
    private var lastLocation: Location? = null
    private val recentSpeedSamples = mutableListOf<Float>()

    private var sensorManager: SensorManager? = null
    private var sensorListener: SensorEventListener? = null
    /** [Sensor.TYPE_LINEAR_ACCELERATION] si existe; si no [Sensor.TYPE_ACCELEROMETER]. */
    private var strokeSensorType: Int = Sensor.TYPE_ACCELEROMETER

    /** Para el modo Pantalla acostada: rotación del display al mapear el plano XY del chip a la pantalla. */
    private var strokeDisplay: android.view.Display? = null
    private var locationManager: LocationManager? = null
    private var locationListener: LocationListener? = null
    private var fusedClient: FusedLocationProviderClient? = null
    private var fusedCallback: LocationCallback? = null

    private var threshold: Float = 0.4f
    private var lastStrokeAcceleration: Float = 0f
    private var currentFilteredAbsAccel: Float = 0f
    private var isStrokeUp: Boolean = false
    private var strokeMinIntervalMs: Long = 400L
    private var spmIntervals: Int = 2
    private var lastStrokeTime: Long = 0L
    private var lastAccelerationTime: Long = 0L
    private var maxStrokeAcceleration: Float = 0f
    private val strokeTimes = mutableListOf<Long>()
    private val strokeSegmentMeters = mutableListOf<Float>()
    private var lastDistanceAtStrokeMeters: Float = 0f

    /** Picos |aceleración del eje elegido| (m/s²) por palada completada; se drenan al grabar cada punto 1 Hz al JSON. */
    private val pendingStrokePeakAbsMs2 = mutableListOf<Float>()

    /** Máximo |a| de cada palada completada, en orden (raíz del JSON de sesión). */
    private val completedStrokePeakAbsMs2 = mutableListOf<Float>()

    private var metrics = TrainingLiveMetrics()
    private var prefs: StrokeGpsPreferences = StrokeGpsPreferences(
        speedSmoothSamples = 2,
        strokeMinIntervalMs = 400L,
        spmIntervals = 2,
        dpsStrokeWindow = 2,
        strokeAccelAxisMode = StrokeAccelAxisMode.PORTRAIT,
        strokeSensitivity = 0.4f,
    )

    private fun emit() {
        onLiveMetricsChanged(metrics)
    }

    private fun setMetrics(block: TrainingLiveMetrics.() -> TrainingLiveMetrics) {
        metrics = metrics.block()
        emit()
    }

    fun currentMetrics(): TrainingLiveMetrics = metrics

    fun lastKnownLocation(): Location? = lastLocation

    /**
     * Entre dos muestras de 1 Hz: máximo de los picos de intensidad de cada palada completada en ese intervalo (|a| en m/s² según modo Pantalla parada o acostada).
     * Si no hubo palada, null. Varios golpes en el mismo segundo: se guarda el máximo del conjunto.
     */
    fun drainStrokePeaksMaxSinceLastDataPoint(): Float? {
        if (pendingStrokePeakAbsMs2.isEmpty()) return null
        val m = pendingStrokePeakAbsMs2.maxOrNull()!!
        pendingStrokePeakAbsMs2.clear()
        return m
    }

    fun setPreferences(p: StrokeGpsPreferences) {
        prefs = p
    }

    /**
     * Nuevo [start]: limpiar fix anterior y estado de paladas para no arrancar con metros “fantasma”.
     */
    fun prepareFreshSessionStart() {
        lastLocation = null
        distanceWallWindowStartMs = 0L
        distanceAddedInWallWindow = 0f
        recentSpeedSamples.clear()
        strokeTimes.clear()
        lastStrokeAcceleration = 0f
        currentFilteredAbsAccel = 0f
        isStrokeUp = false
        lastStrokeTime = 0L
        maxStrokeAcceleration = 0f
        pendingStrokePeakAbsMs2.clear()
        completedStrokePeakAbsMs2.clear()
        strokeSegmentMeters.clear()
        lastDistanceAtStrokeMeters = 0f
        consecutiveGpsStuck = 0
        metrics = TrainingLiveMetrics()
        emit()
    }

    /**
     * [reset] / [configureForCompetencia]: borrar todo lo relativo a hardware y medición.
     */
    fun resetAllMeasurementState() {
        lastLocation = null
        distanceWallWindowStartMs = 0L
        distanceAddedInWallWindow = 0f
        consecutiveGpsStuck = 0
        strokeTimes.clear()
        recentSpeedSamples.clear()
        lastStrokeAcceleration = 0f
        currentFilteredAbsAccel = 0f
        isStrokeUp = false
        lastStrokeTime = 0L
        maxStrokeAcceleration = 0f
        pendingStrokePeakAbsMs2.clear()
        completedStrokePeakAbsMs2.clear()
        strokeSegmentMeters.clear()
        lastDistanceAtStrokeMeters = 0f
        metrics = TrainingLiveMetrics()
        emit()
    }

    /**
     * Cada [start] limpia segmentos DPS/session; si no es [prepareFreshSessionStart], no se borra lastLocation ni paladas.
     */
    fun clearStrokeBuffersOnly() {
        strokeSegmentMeters.clear()
        lastDistanceAtStrokeMeters = 0f
    }

    /**
     * [resetForNextExercise]: nuevo tramo sin apagado total de sensores.
     */
    fun resetMetricsForNextExercise() {
        strokeTimes.clear()
        lastStrokeTime = 0L
        strokeSegmentMeters.clear()
        lastDistanceAtStrokeMeters = 0f
        lastLocation = null
        distanceWallWindowStartMs = 0L
        distanceAddedInWallWindow = 0f
        consecutiveGpsStuck = 0
        recentSpeedSamples.clear()
        pendingStrokePeakAbsMs2.clear()
        completedStrokePeakAbsMs2.clear()
        metrics = metrics.copy(
            distanceMeters = 0f,
            paladas = 0,
            spm = 0,
            dpsMeters = 0f,
        )
        emit()
    }

    /** Picos |aceleración| (m/s²) por palada, en el orden en que se detectaron. */
    fun getStrokePeakAccelerationsMs2(): List<Float> = completedStrokePeakAbsMs2.toList()

    /**
     * Una sola componente según la configuración:
     * - [StrokeAccelAxisMode.LANDSCAPE] (**Pantalla parada**): aceleración lineal a lo largo del **eje Z del dispositivo**
     *   (perpendicular al vidrio: hacia tu cara / alejándose), con el teléfono enfrente a los ojos. No usa
     *   izquierda–derecha en el plano de la pantalla.
     * - [StrokeAccelAxisMode.PORTRAIT] (**Pantalla acostada**): componente **en el plano de la pantalla** vertical
     *   respecto a la rotación actual ([Display.rotation]); es el modo que ya funcionaba en el plano del vidrio.
     *
     * En ambos casos la componente elegida debe **dominar** a la “perpendicular” (en parada: |Z| frente al plano XY;
     * en acostada: sy frente a sx). Si la perpendicular es solo ruido ([STROKE_PERP_COMPONENT_EPS_MS2]), no se exige ratio.
     */
    private fun strokeAccelerationRaw(event: SensorEvent): Float {
        val v = event.values
        if (v.size < 2) return 0f
        val ax = v[0]
        val ay = v[1]
        val r = STROKE_SCREEN_AXIS_DOMINANCE_RATIO
        val eps = STROKE_PERP_COMPONENT_EPS_MS2
        return when (prefs.strokeAccelAxisMode) {
            StrokeAccelAxisMode.LANDSCAPE -> {
                if (v.size < 3) return 0f
                val az = v[2]
                val inPlane = hypot(ax.toDouble(), ay.toDouble()).toFloat()
                when {
                    inPlane <= eps -> az
                    abs(az) >= inPlane * r -> az
                    else -> 0f
                }
            }
            StrokeAccelAxisMode.PORTRAIT -> {
                val rot = displayRotationForStroke()
                val (sx, sy) = deviceAccelPlaneToScreenAxes(ax, ay, rot)
                val absSx = abs(sx)
                val absSy = abs(sy)
                when {
                    absSx <= eps -> sy
                    absSy >= absSx * r -> sy
                    else -> 0f
                }
            }
        }
    }

    private fun displayRotationForStroke(): Int {
        val d = strokeDisplay ?: return Surface.ROTATION_0
        @Suppress("DEPRECATION")
        return d.rotation
    }

    /**
     * [Context.applicationContext] no tiene [Display] en API 30+; hay que usar el [Context]
     * de la Activity o caer a [WindowManager.getDefaultDisplay] (retirado pero válido aquí).
     */
    private fun displayForStrokeDetection(context: Context): Display? {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                return context.display
            } catch (_: UnsupportedOperationException) {
                // Context sin pantalla asociada (p. ej. Application).
            }
        }
        @Suppress("DEPRECATION")
        return wm?.defaultDisplay
    }

    /**
     * Pasa (ax, ay) del plano XY del dispositivo a ejes alineados con la pantalla visible.
     * Tabla habitual según [Surface.ROTATION_*] (orientación natural portrait en la mayoría de los teléfonos).
     */
    private fun deviceAccelPlaneToScreenAxes(ax: Float, ay: Float, rotation: Int): Pair<Float, Float> =
        when (rotation) {
            Surface.ROTATION_0 -> ax to ay
            Surface.ROTATION_90 -> (-ay) to ax
            Surface.ROTATION_180 -> (-ax) to (-ay)
            Surface.ROTATION_270 -> ay to (-ax)
            else -> ax to ay
        }

    fun startLocationUpdates(context: Context) {
        if (!hasLocationPermission(context)) return
        if (fusedCallback != null || locationListener != null) return
        recentSpeedSamples.clear()
        val ctx = context.applicationContext

        val client = LocationServices.getFusedLocationProviderClient(ctx)
        fusedClient = client
        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                // Un solo tramo hacia el fix más reciente: iterar toda la ráfaga sumaba
                // N veces (p. ej. 10×18 m) en un “momento” de pared y disparaba distancia/JSON.
                val loc = result.lastLocation ?: return
                applyIncomingLocation(loc, ctx)
            }
        }
        fusedCallback = callback

        try {
            val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 500L)
                .setMinUpdateIntervalMillis(200L)
                .setMinUpdateDistanceMeters(0f)
                .setMaxUpdateDelayMillis(0L)
                .build()
            client.requestLocationUpdates(request, callback, Looper.getMainLooper())
        } catch (_: Exception) {
            fusedCallback = null
            fusedClient = null
            startLocationUpdatesLegacy(ctx)
        }
    }

    fun stopLocationUpdates() {
        fusedCallback?.let { cb ->
            fusedClient?.removeLocationUpdates(cb)
        }
        fusedCallback = null
        fusedClient = null
        locationListener?.let { listener ->
            locationManager?.removeUpdates(listener)
        }
        locationListener = null
        locationManager = null
    }

    private fun startLocationUpdatesLegacy(ctx: Context) {
        val locMgr = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        locationManager = locMgr
        val provider = if (locMgr.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            LocationManager.GPS_PROVIDER
        } else {
            LocationManager.NETWORK_PROVIDER
        }
        val listener = LocationListener { location ->
            applyIncomingLocation(location, ctx)
        }
        locationListener = listener
        try {
            val minMs = 500L
            val minM = 0f
            if (locMgr.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locMgr.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    minMs,
                    minM,
                    listener,
                    Looper.getMainLooper(),
                )
            }
            if (locMgr.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locMgr.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    minMs,
                    minM,
                    listener,
                    Looper.getMainLooper(),
                )
            }
            if (!locMgr.isProviderEnabled(LocationManager.GPS_PROVIDER) &&
                !locMgr.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            ) {
                locMgr.requestLocationUpdates(
                    provider,
                    minMs,
                    minM,
                    listener,
                    Looper.getMainLooper(),
                )
            }
        } catch (_: SecurityException) {}
    }

    /**
     * Delta entre dos fixes: [Location.getElapsedRealtimeNanos] es monotónico; si fuese incoherente, [Location.getTime].
     */
    private fun timeDeltaMsMonotonic(a: Location, b: Location): Long {
        val dNs = b.elapsedRealtimeNanos - a.elapsedRealtimeNanos
        if (dNs > 0L) return dNs / 1_000_000L
        val dt = b.time - a.time
        return if (dt > 0L) dt else 0L
    }

    private fun applyIncomingLocation(location: Location, ctx: Context) {
        if (sessionActive()) {
            val previousFix = lastLocation
            val rawSpeed = if (location.hasSpeed()) location.speed else 0f
            val smoothN = prefs.speedSmoothSamples
            recentSpeedSamples.add(rawSpeed)
            while (recentSpeedSamples.size > SPEED_SMOOTH_MAX_SAMPLES) recentSpeedSamples.removeAt(0)
            val window = minOf(smoothN, recentSpeedSamples.size).coerceAtLeast(1)
            val smoothedSpeed = recentSpeedSamples.takeLast(window).sum() / window
            val newMaxSpeed = maxOf(metrics.sessionMaxSpeedMps, rawSpeed)
            var newDist = metrics.distanceMeters
            previousFix?.let { last ->
                val deltaMs = timeDeltaMsMonotonic(last, location)
                // elapsedRealtime: Δt fiable; exige >0 para no duplicar tramos
                if (deltaMs in 1L..60_000L) {
                    val raw = location.distanceTo(last)
                    val timeS = (deltaMs / 1000.0).toFloat().coerceIn(0.05f, 20f)
                    val maxBySpeed = 40f * timeS
                    var segment = raw.coerceAtMost(maxBySpeed).coerceAtMost(
                        MAX_METERS_PER_GPS_SEGMENT,
                    )
                    if (raw < GPS_STUCK_RAW_METERS) {
                        consecutiveGpsStuck++
                    } else {
                        if (consecutiveGpsStuck >= GPS_STUCK_STEPS_TO_TELEPORT && raw > GPS_TELEPORT_RAW_MIN_METERS) {
                            segment = segment.coerceAtMost(GPS_TELEPORT_SEGMENT_CAP)
                        }
                        consecutiveGpsStuck = 0
                    }
                    if (location.hasAccuracy() && last.hasAccuracy()) {
                        val worst = maxOf(location.accuracy, last.accuracy)
                        if (worst > GPS_ACCURACY_BAD_M) {
                            segment = segment.coerceAtMost(6f)
                        } else if (worst > GPS_ACCURACY_POOR_M) {
                            segment = segment.coerceAtMost(10f)
                        }
                    }
                    if (segment > 0f) {
                        val nowWall = System.currentTimeMillis()
                        if (nowWall - distanceWallWindowStartMs >= 1000L) {
                            distanceWallWindowStartMs = nowWall
                            distanceAddedInWallWindow = 0f
                        }
                        val room = (
                            MAX_METERS_ADDED_PER_WALL_CLOCK_SECOND - distanceAddedInWallWindow
                            ).coerceAtLeast(0f)
                        segment = segment.coerceAtMost(room)
                        if (segment > 0f) {
                            newDist += segment
                            distanceAddedInWallWindow += segment
                        }
                    }
                }
            }
            metrics = metrics.copy(
                distanceMeters = newDist,
                speedMps = smoothedSpeed,
                sessionMaxSpeedMps = newMaxSpeed,
            )
            emit()
            onAfterLocationApplied()
        }
        lastLocation = location
    }

    fun startSensor(context: Context) {
        if (!sessionActive()) return

        strokeMinIntervalMs = prefs.strokeMinIntervalMs
        spmIntervals = prefs.spmIntervals

        val ctx = context.applicationContext
        val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        sensorManager = sm

        val linear = sm.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
        val accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        val acc = linear ?: accel ?: return
        strokeSensorType = acc.type

        strokeDisplay = displayForStrokeDetection(context)

        val sens = prefs.strokeSensitivity.coerceIn(0f, 1f)
        threshold = if (sens <= 0f) 0.01f else sens

        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                if (event.sensor.type != strokeSensorType) return
                if (!sessionActive()) return

                val strokeAccel = strokeAccelerationRaw(event)
                val currentTime = System.currentTimeMillis()
                val absStroke = abs(strokeAccel)

                if (absStroke < ACCELERATION_THRESHOLD) {
                    currentFilteredAbsAccel = 0f
                } else {
                    currentFilteredAbsAccel = 0.3f * absStroke + 0.7f * currentFilteredAbsAccel
                }

                if (currentTime - lastAccelerationTime > 500) {
                    lastAccelerationTime = currentTime

                    if (currentTime - lastStrokeTime > STROKE_RESET_INTERVAL_MS && lastStrokeTime > 0) {
                        strokeTimes.clear()
                        strokeSegmentMeters.clear()
                        lastDistanceAtStrokeMeters = metrics.distanceMeters
                        metrics = metrics.copy(spm = 0, dpsMeters = 0f)
                        lastStrokeTime = 0L
                        emit()
                    }
                }

                if (strokeAccel > lastStrokeAcceleration && strokeAccel > threshold) {
                    if (!isStrokeUp) {
                        isStrokeUp = true
                        maxStrokeAcceleration = 0f
                    }
                }

                if (isStrokeUp) {
                    if (absStroke > maxStrokeAcceleration) maxStrokeAcceleration = absStroke
                }

                if (isStrokeUp && strokeAccel < lastStrokeAcceleration && strokeAccel < -threshold) {
                    if (currentTime - lastStrokeTime >= strokeMinIntervalMs) {
                        pendingStrokePeakAbsMs2.add(maxStrokeAcceleration)
                        completedStrokePeakAbsMs2.add(maxStrokeAcceleration)
                        val paladas = metrics.paladas + 1
                        strokeTimes.add(currentTime)
                        if (strokeTimes.size > STROKE_TIMES_TO_KEEP) strokeTimes.removeAt(0)

                        val spm = SpmCalculator.computeSpm(strokeTimes, spmIntervals)
                        val dpsMeters = appendStrokeSegmentAndAverageDps(ctx)
                        metrics = metrics.copy(paladas = paladas, spm = spm, dpsMeters = dpsMeters)
                        emit()

                        isStrokeUp = false
                        lastStrokeTime = currentTime
                        maxStrokeAcceleration = 0f
                    }
                }

                lastStrokeAcceleration = strokeAccel
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        sensorListener = listener
        sm.registerListener(listener, acc, SensorManager.SENSOR_DELAY_GAME, Handler(Looper.getMainLooper()))
        refreshDpsFromSegments(ctx)
    }

    private fun appendStrokeSegmentAndAverageDps(context: Context): Float {
        val distNow = metrics.distanceMeters
        val delta = (distNow - lastDistanceAtStrokeMeters).coerceAtLeast(0f)
        lastDistanceAtStrokeMeters = distNow
        strokeSegmentMeters.add(delta)
        while (strokeSegmentMeters.size > STROKE_DISTANCE_SEGMENTS_MAX) strokeSegmentMeters.removeAt(0)
        val n = prefs.dpsStrokeWindow.coerceIn(1, 5)
        val slice = strokeSegmentMeters.takeLast(n)
        return if (slice.isNotEmpty()) slice.average().toFloat() else 0f
    }

    private fun refreshDpsFromSegments(context: Context) {
        val n = prefs.dpsStrokeWindow.coerceIn(1, 5)
        val slice = strokeSegmentMeters.takeLast(n)
        val avg = if (slice.isNotEmpty()) slice.average().toFloat() else 0f
        metrics = metrics.copy(dpsMeters = avg)
        emit()
    }

    fun stopSensor() {
        sensorListener?.let { listener ->
            sensorManager?.unregisterListener(listener)
        }
        sensorListener = null
        strokeDisplay = null
        sensorManager = null
    }

    fun release() {
        stopSensor()
        stopLocationUpdates()
    }
}
