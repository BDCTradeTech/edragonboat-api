package com.example.minidboat.training

internal object SpmCalculator {
    private const val SPM_PALADAS_MIN = 2

    fun computeSpm(strokeTimes: List<Long>, spmIntervals: Int): Int {
        if (strokeTimes.size < SPM_PALADAS_MIN) return 0
        val neededTimestamps = spmIntervals + 1
        val n = minOf(neededTimestamps, strokeTimes.size)
        val inicio = strokeTimes.size - n
        val intervaloMs = strokeTimes.last() - strokeTimes[inicio]
        if (intervaloMs < 100) return 0
        val intervaloMin = intervaloMs / 60000.0
        val paladasEnIntervalo = n - 1
        return (paladasEnIntervalo / intervaloMin).toInt()
    }
}
