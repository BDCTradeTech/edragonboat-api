package com.example.minidboat.util

import com.example.minidboat.viewmodel.LibreSessionDataPoint
import kotlin.math.abs
import kotlin.math.roundToInt

/** Misma geometría y divisiones que el gráfico del JPG y la pantalla Gráficos. */
object SessionChartLayout {

    /**
     * Velocidad y SPM: fracción del alto del área de trazado hacia arriba que ocupa la escala
     * (el tope del eje queda libre para el eje de paladas). Valor mayor = curvas más “altas”.
     */
    const val Y_VALUE_MAX_FRACTION = 0.97f

    /**
     * Referencia bitmap 600×400: eje paladas arriba, tope del área de curvas.
     * La leyenda km/h–SPM se coloca dentro del trazado con [LEGEND_VERTICAL_CENTER_FRACTION].
     */
    /** Fracción 0–1 desde [plotTop] hacia [plotBottom] donde se centra la leyenda (mitad inferior del área útil). */
    const val LEGEND_VERTICAL_CENTER_FRACTION = 0.74f

    const val REF_PALADAS_AXIS_Y = 32f
    const val REF_PALADAS_CAPTION_OFFSET = 14f
    const val REF_PLOT_TOP = 56f
    const val REF_CHART_LEFT = 96f
    const val REF_BOTTOM_MARGIN = 58f

    /** Distancia desde el eje Y hasta el centro del texto del eje girado (km/h o SPM). */
    const val REF_Y_AXIS_LABEL_OFFSET = 44f

    /** Fracción inferior del área bajo los ejes Y donde se dibuja la curva DPS (misma caja que km/h y SPM). */
    const val DPS_BAND_FRACTION_OF_PLOT = 0.22f

    /** Tope (Y mayor) de la región DPS; coincide con el suelo del área velocidad/SPM. */
    fun mainPlotBottomY(plotTop: Float, plotBottom: Float): Float {
        val h = plotBottom - plotTop
        return plotTop + h * (1f - DPS_BAND_FRACTION_OF_PLOT)
    }

    /** Base del trazado DPS: mismo rectángulo del gráfico, sin hueco respecto a velocidad/SPM. */
    fun dpsBandTopY(mainPlotBottom: Float, @Suppress("UNUSED_PARAMETER") gapPx: Float): Float =
        mainPlotBottom

    fun dpsBandBottomY(plotBottom: Float, insetPx: Float): Float = plotBottom - insetPx

    fun dpsToY(dps: Float, maxDps: Float, bandBottom: Float, bandTop: Float): Float {
        val m = maxDps.coerceAtLeast(0.05f)
        val t = (dps / m).coerceIn(0f, 1f)
        return bandBottom - t * 0.9f * (bandBottom - bandTop)
    }

    fun speedToY(speedKmh: Float, maxSpeed: Float, chartBottom: Float, chartTop: Float): Float {
        val t = if (maxSpeed <= 0f) 0f else (speedKmh / maxSpeed).coerceIn(0f, 1f)
        return chartBottom - t * Y_VALUE_MAX_FRACTION * (chartBottom - chartTop)
    }

    fun timeToX(tSec: Float, maxTime: Float, chartLeft: Float, chartWidth: Float): Float {
        val t = if (maxTime <= 0f) 0f else (tSec / maxTime).coerceIn(0f, 1f)
        return chartLeft + t * chartWidth
    }

    fun spmToY(s: Int, maxSpm: Int, chartBottom: Float, chartTop: Float): Float {
        val m = maxSpm.coerceAtLeast(1)
        val tt = (s.toFloat() / m).coerceIn(0f, 1f)
        return chartBottom - tt * Y_VALUE_MAX_FRACTION * (chartBottom - chartTop)
    }

    fun maxPaladas(points: List<LibreSessionDataPoint>): Int =
        points.maxOfOrNull { it.paladas }?.coerceAtLeast(0) ?: 0

    /** Tiempos en segundos en que la sesión alcanza ~[target] paladas (interpolado). */
    fun paladasCountToTimeSeconds(target: Float, points: List<LibreSessionDataPoint>): Float {
        if (points.isEmpty()) return 0f
        val sorted = points.sortedBy { it.second }
        val maxP = sorted.maxOf { it.paladas }.toFloat()
        val tClamped = target.coerceIn(0f, maxP)
        if (tClamped <= sorted.first().paladas) return sorted.first().second.toFloat()
        if (tClamped >= sorted.last().paladas) return sorted.last().second.toFloat()
        for (i in 0 until sorted.lastIndex) {
            val a = sorted[i]
            val b = sorted[i + 1]
            val pa = a.paladas.toFloat()
            val pb = b.paladas.toFloat()
            val lo = minOf(pa, pb)
            val hi = maxOf(pa, pb)
            if (tClamped in lo..hi) {
                if (abs(pb - pa) < 1e-5f) return b.second.toFloat()
                val frac = (tClamped - pa) / (pb - pa)
                return a.second + frac * (b.second - a.second)
            }
        }
        return sorted.last().second.toFloat()
    }

    fun paladasToX(
        targetPaladas: Float,
        points: List<LibreSessionDataPoint>,
        maxTime: Float,
        chartLeft: Float,
        chartWidth: Float
    ): Float {
        val sec = paladasCountToTimeSeconds(targetPaladas, points)
        return timeToX(sec, maxTime, chartLeft, chartWidth)
    }

    fun majorPaladaTicks(maxPaladas: Int): List<Int> {
        if (maxPaladas <= 0) return listOf(0)
        return buildList {
            add(0)
            add((maxPaladas * 0.25f).roundToInt().coerceIn(0, maxPaladas))
            add((maxPaladas * 0.5f).roundToInt())
            add((maxPaladas * 0.75f).roundToInt().coerceIn(0, maxPaladas))
            add(maxPaladas)
        }.distinct().sorted()
    }

    fun minorPaladaTicks(maxPaladas: Int, majorPaladas: List<Int>): List<Float> {
        if (maxPaladas <= 0) return emptyList()
        val maxF = maxPaladas.toFloat().coerceAtLeast(1f)
        return listOf(1, 3, 5, 7).map { it * maxF / 8f }
            .filter { mt ->
                majorPaladas.none { am ->
                    abs(am - mt) < maxF * 0.02f + 0.01f
                }
            }
    }

    fun buildSpeedAxisTicks(points: List<LibreSessionDataPoint>, maxSpeed: Float): List<Float> {
        if (maxSpeed < 0.05f) return listOf(0f)
        val rounded = points.map { ((it.speedKmh * 2f).roundToInt() / 2f).coerceAtLeast(0f) }
        val counts = rounded.groupingBy { it }.eachCount().entries.sortedByDescending { it.value }
        val result = LinkedHashSet<Float>()
        result.add(0f)
        result.add(maxSpeed)
        val minGap = maxOf(maxSpeed * 0.1f, 0.5f)
        for ((v, _) in counts) {
            if (v <= 0.01f || abs(v - maxSpeed) < 0.01f) continue
            if (result.none { abs(it - v) < minGap }) result.add(v)
            if (result.size >= 6) break
        }
        if (result.size < 3 && maxSpeed > 0.5f) {
            val mid = ((maxSpeed / 2f * 2f).roundToInt() / 2f).coerceAtLeast(0.5f)
            if (abs(mid - maxSpeed) >= minGap && mid > 0f) result.add(mid)
        }
        return result.sorted()
    }

    fun buildSpmAxisTicks(maxSpm: Int): List<Int> {
        val m = maxSpm.coerceAtLeast(1)
        return listOf(0, (m * 0.25f).roundToInt(), (m * 0.5f).roundToInt(), (m * 0.75f).roundToInt(), m)
            .map { it.coerceIn(0, m) }
            .distinct()
            .sorted()
    }

    fun majorTimeTicks(maxTime: Float): List<Float> {
        return buildList {
            add(0f)
            add(maxTime * 0.25f)
            add(maxTime * 0.5f)
            add(maxTime * 0.75f)
            add(maxTime)
        }.distinctBy { (it * 100).roundToInt() }.sorted()
    }

    fun minorTimeTicks(maxTime: Float, majorTimes: List<Float>): List<Float> {
        return listOf(1, 3, 5, 7).map { it * maxTime / 8f }
            .filter { mt -> majorTimes.none { abs(it - mt) < maxTime * 0.02f } }
    }

    data class ChartDpsModel(
        val series: List<Float>,
        val maxDpsScale: Float,
        val maxSample: Float,
        val minSample: Float,
        val modeDps: Float,
        val modeCount: Int,
        val strokeCount: Int,
    )

    /**
     * DPS por palada entre muestras consecutivas (1 Hz): Δdistancia/Δpaladas.
     * La serie para dibujar rellena hacia adelante el último valor conocido.
     */
    fun buildChartDpsModel(points: List<LibreSessionDataPoint>): ChartDpsModel {
        if (points.isEmpty()) {
            return ChartDpsModel(emptyList(), 0.1f, 0f, 0f, 0f, 0, 0)
        }
        val sorted = points.sortedBy { it.second }
        val strokeValues = mutableListOf<Float>()
        val raw = FloatArray(sorted.size) { Float.NaN }
        for (i in 1 until sorted.size) {
            val dp = sorted[i].paladas - sorted[i - 1].paladas
            val dd = sorted[i].distanceMeters - sorted[i - 1].distanceMeters
            if (dp > 0) {
                val v = (dd / dp.toFloat()).coerceAtLeast(0f)
                raw[i] = v
                strokeValues.add(v)
            }
        }
        var lastFilled = 0f
        val series = List(sorted.size) { i ->
            if (!raw[i].isNaN()) lastFilled = raw[i]
            lastFilled
        }
        val maxSample = strokeValues.maxOrNull() ?: 0f
        val minSample = if (strokeValues.isEmpty()) 0f else strokeValues.minOrNull() ?: 0f
        val rounded = strokeValues.map { (it * 100f).roundToInt() / 100f }
        val modeEntry = rounded.groupingBy { it }.eachCount().entries.maxWithOrNull(
            compareBy<Map.Entry<Float, Int>> { it.value }.thenByDescending { it.key }
        )
        val modeDps = modeEntry?.key ?: 0f
        val modeCount = modeEntry?.value ?: 0
        val maxInSeries = series.maxOrNull() ?: 0f
        val maxDpsScale = maxOf(maxInSeries, maxSample, 0.1f) * 1.1f
        return ChartDpsModel(
            series = series,
            maxDpsScale = maxDpsScale,
            maxSample = maxSample,
            minSample = minSample,
            modeDps = modeDps,
            modeCount = modeCount,
            strokeCount = strokeValues.size,
        )
    }
}
