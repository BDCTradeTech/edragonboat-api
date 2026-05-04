package com.example.minidboat.training

/**
 * Métricas en vivo compartidas entre GPS y acelerómetro (Libre, Ejercicios con rutina, Competencia).
 */
data class TrainingLiveMetrics(
    val distanceMeters: Float = 0f,
    val speedMps: Float = 0f,
    val sessionMaxSpeedMps: Float = 0f,
    val paladas: Int = 0,
    val spm: Int = 0,
    val dpsMeters: Float = 0f,
) {
    val speedKmh: Float get() = speedMps * 3.6f
}
