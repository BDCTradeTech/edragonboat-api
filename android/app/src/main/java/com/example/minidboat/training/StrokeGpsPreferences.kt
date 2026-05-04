package com.example.minidboat.training

/**
 * Qué componente del acelerómetro usa la detección: una sola, nunca combinadas.
 * [LANDSCAPE] = **Pantalla parada**: eje Z (adelante/atrás mirando la pantalla; normal al vidrio).
 * [PORTRAIT] = **Pantalla acostada**: en el plano del vidrio, componente vertical de pantalla (según rotación).
 */
enum class StrokeAccelAxisMode {
    LANDSCAPE,
    PORTRAIT,
}

/**
 * Valores de configuración para paladas / GPS (viene de preferencias de la app).
 */
data class StrokeGpsPreferences(
    val speedSmoothSamples: Int,
    val strokeMinIntervalMs: Long,
    val spmIntervals: Int,
    val dpsStrokeWindow: Int,
    val strokeAccelAxisMode: StrokeAccelAxisMode = StrokeAccelAxisMode.PORTRAIT,
    /** Umbral de pico (m/s²), 0–1 según configuración; controla sensibilidad. */
    val strokeSensitivity: Float = 0.4f,
)
