package com.example.minidboat.util

import android.content.Context
import com.example.minidboat.R
import com.example.minidboat.viewmodel.LibreSessionDataPoint
import kotlin.math.abs
import kotlin.math.sqrt

data class ChartSessionAnalysis(
    val aciertos: List<String>,
    val errores: List<String>,
    val mejoras: List<String>,
)

/**
 * Sugerencias automáticas a partir de velocidad y SPM (1 Hz). No sustituye criterio del entrenador.
 */
fun analyzeSessionChart(context: Context, points: List<LibreSessionDataPoint>): ChartSessionAnalysis {
    val r = context.resources
    if (points.isEmpty()) {
        return ChartSessionAnalysis(
            aciertos = emptyList(),
            errores = listOf(r.getString(R.string.chart_err_no_points)),
            mejoras = listOf(r.getString(R.string.chart_hint_select_other)),
        )
    }

    val p = points.sortedBy { it.second }
    val n = p.size
    val durationSec = p.last().second.coerceAtLeast(1L)
    val speeds = p.map { it.speedKmh }
    val spms = p.map { it.spm.toFloat() }

    val meanSpeed = speeds.average().toFloat()
    val maxSpeed = speeds.maxOrNull() ?: 0f
    val meanSpm = spms.average().toFloat().coerceAtLeast(0.1f)
    val varianceSpm = spms.map { val d = it - meanSpm; d * d }.average().toFloat()
    val stdSpm = sqrt(varianceSpm.toDouble()).toFloat()

    val aciertos = mutableListOf<String>()
    val errores = mutableListOf<String>()
    val mejoras = mutableListOf<String>()

    if (durationSec >= 120L) {
        aciertos.add(r.getString(R.string.chart_ok_duration_s, durationSec))
    }
    if (durationSec < 45L) {
        errores.add(r.getString(R.string.chart_warn_short))
    }

    val relNoise = if (meanSpeed > 0.2f) speeds.zipWithNext { a, b -> abs(a - b) }.average()
        .toFloat() / meanSpeed else 0f
    if (n >= 15 && relNoise > 0.28f) {
        errores.add(r.getString(R.string.chart_err_speed_oscillates))
        mejoras.add(r.getString(R.string.chart_improve_smoother))
    }

    if (stdSpm < meanSpm * 0.12f && meanSpm > 2f) {
        aciertos.add(r.getString(R.string.chart_ok_spm_steady))
    } else if (stdSpm > meanSpm * 0.25f) {
        errores.add(r.getString(R.string.chart_err_spm_vary))
        mejoras.add(r.getString(R.string.chart_improve_spm))
    }

    if (n >= 12) {
        val iCut = (n * 0.18).toInt().coerceAtLeast(2).coerceAtMost(n / 2)
        val earlySpeed = p.take(iCut).map { it.speedKmh }.average().toFloat()
        val lateSpeed = p.takeLast(iCut).map { it.speedKmh }.average().toFloat()
        when {
            earlySpeed > 0.3f && lateSpeed < earlySpeed * 0.85f -> {
                errores.add(r.getString(R.string.chart_err_fatigue))
                mejoras.add(r.getString(R.string.chart_improve_fatigue))
            }
            lateSpeed >= earlySpeed * 0.94f && earlySpeed > 0.2f -> {
                aciertos.add(r.getString(R.string.chart_ok_late_speed))
            }
        }
    }

    val hiSpm = meanSpm + stdSpm * 0.8f
    val speedLow = meanSpeed * 0.88f
    val inefficient = p.count { it.spm >= hiSpm && it.speedKmh <= speedLow && meanSpeed > 0.15f }
    if (n > 25 && inefficient > n * 0.12f) {
        errores.add(r.getString(R.string.chart_err_low_efficiency))
        mejoras.add(r.getString(R.string.chart_improve_efficiency))
    }

    if (maxSpeed > meanSpeed * 1.18f && meanSpeed > 0.2f) {
        aciertos.add(r.getString(R.string.chart_ok_speed_spike))
    }

    if (meanSpeed < 0.12f && durationSec > 30L) {
        mejoras.add(r.getString(R.string.chart_improve_low_mean_speed))
    }

    if (aciertos.isEmpty()) {
        aciertos.add(r.getString(R.string.chart_ok_recorded))
    }
    if (errores.isEmpty()) {
        errores.add(r.getString(R.string.chart_info_no_strong_neg))
    }
    if (mejoras.isEmpty()) {
        mejoras.add(r.getString(R.string.chart_improve_compare))
    }

    return ChartSessionAnalysis(
        aciertos = aciertos.distinct(),
        errores = errores.distinct(),
        mejoras = mejoras.distinct(),
    )
}
