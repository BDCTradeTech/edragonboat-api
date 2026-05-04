package com.example.minidboat.util

import android.content.Context
import com.example.minidboat.R
import com.example.minidboat.viewmodel.LibreSessionDataPoint
import com.example.minidboat.viewmodel.LibreSessionJson
import com.example.minidboat.viewmodel.metadataLine
import java.text.NumberFormat
import java.util.Locale
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import androidx.core.content.FileProvider
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.min
import kotlin.math.roundToInt

private const val ROUTE_MAP_HEIGHT_PX = 320
private const val ROUTE_MAP_PAD = 48f
private val ROUTE_POLYLINE_COLORS = intArrayOf(
    Color.parseColor("#1976D2"),
    Color.parseColor("#E65100"),
    Color.parseColor("#7B1FA2"),
    Color.parseColor("#2E7D32"),
    Color.parseColor("#C62828"),
)

/**
 * Puntos (lat, lon) con GPS válido en el orden temporal del JSON.
 */
fun extractGpsPolylineFromDataPoints(points: List<LibreSessionDataPoint>): List<Pair<Double, Double>> =
    points.mapNotNull { p ->
        val la = p.latitude ?: return@mapNotNull null
        val lo = p.longitude ?: return@mapNotNull null
        la to lo
    }

/**
 * Un [List] por cada sesión JSON: sirve para un resumen del día con varios entrenamientos en el mismo mapa.
 */
fun buildGpsRouteGroupsFromSessions(sessions: List<LibreSessionJson>): List<List<Pair<Double, Double>>> =
    sessions.map { extractGpsPolylineFromDataPoints(it.dataPoints) }.filter { it.size >= 2 }

/**
 * Apila dos bitmaps en vertical (mismo ancho lógico [canvasWidth]).
 */
private fun appendBitmapVertically(top: Bitmap, bottom: Bitmap, canvasWidth: Int): Bitmap {
    val w = maxOf(top.width, bottom.width, canvasWidth)
    val h = top.height + bottom.height
    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    c.drawBitmap(top, 0f, 0f, null)
    c.drawBitmap(bottom, 0f, top.height.toFloat(), null)
    return out
}

/** Distancia en metros entre dos WGS84 (Haversine). */
private fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val r = 6371000.0
    val p1 = Math.toRadians(lat1)
    val p2 = Math.toRadians(lat2)
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = sin(dLat / 2) * sin(dLat / 2) + cos(p1) * cos(p2) * sin(dLon / 2) * sin(dLon / 2)
    val c = 2 * asin(sqrt(a.coerceIn(0.0, 1.0)))
    return r * c
}

/**
 * Punto sobre la polilínea al [fraction] de la longitud acumulada (0..1), p. ej. 0,5 = mitad del recorrido real.
 */
private fun latLonAtFractionAlongPolyline(
    segment: List<Pair<Double, Double>>,
    fraction: Float,
): Pair<Double, Double> {
    if (segment.isEmpty()) return 0.0 to 0.0
    if (segment.size == 1) return segment[0]
    val n = segment.size
    val lens = DoubleArray(n - 1) { i ->
        haversineMeters(
            segment[i].first, segment[i].second,
            segment[i + 1].first, segment[i + 1].second,
        )
    }
    val total = lens.sum()
    if (total < 0.05) return segment[n / 2]
    var target = total * fraction.toDouble().coerceIn(0.0, 1.0)
    for (i in lens.indices) {
        val len = lens[i]
        if (target <= len + 1e-6) {
            val t = if (len > 1e-6) (target / len).coerceIn(0.0, 1.0) else 0.0
            val p0 = segment[i]
            val p1 = segment[i + 1]
            return (p0.first + t * (p1.first - p0.first)) to (p0.second + t * (p1.second - p0.second))
        }
        target -= len
    }
    return segment.last()
}

/**
 * Mapa esquemático del recorrido desde JSON (lat/lon): una **línea por tramo** (cada grupo = una sesión),
 * círculo **S** al inicio, meta cuadriculada al fin, y el **número de orden 1, 2, 3…** sobre la línea
 * (mitad del camino recorrido). Usado en la imagen compartida de entrenamiento libre, competencia (mismos datos)
 * y resúmenes con varios JSON (`[gpsRouteGroups]` en [createSummaryImage]).
 */
fun createGpsRouteMapBitmap(
    context: Context,
    width: Int,
    height: Int,
    routes: List<List<Pair<Double, Double>>>,
): Bitmap? {
    val valid = routes.filter { it.size >= 2 }
    if (valid.isEmpty()) return null

    val all = valid.flatten()
    var minLat = all.minOf { it.first }
    var maxLat = all.maxOf { it.first }
    var minLon = all.minOf { it.second }
    var maxLon = all.maxOf { it.second }
    if (maxLat - minLat < 1e-6) {
        minLat -= 1e-5
        maxLat += 1e-5
    }
    if (maxLon - minLon < 1e-6) {
        minLon -= 1e-5
        maxLon += 1e-5
    }
    val dLat = (maxLat - minLat).coerceAtLeast(1e-9)
    val dLon = (maxLon - minLon).coerceAtLeast(1e-9)

    fun project(lat: Double, lon: Double): Pair<Float, Float> {
        val nx = ((lon - minLon) / dLon).toFloat()
        val ny = ((lat - minLat) / dLat).toFloat()
        val innerW = width - 2f * ROUTE_MAP_PAD
        val titleStrip = 54f
        val innerH = height - 2f * ROUTE_MAP_PAD - titleStrip
        val x = ROUTE_MAP_PAD + nx * innerW
        val y = ROUTE_MAP_PAD + titleStrip + (1f - ny) * innerH
        return x to y
    }

    val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    canvas.drawColor(Color.parseColor("#E3F2FD"))

    val titlePaint = Paint().apply {
        color = Color.parseColor("#0D47A1")
        textSize = 20f
        isAntiAlias = true
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.CENTER
    }
    canvas.drawText(
        context.getString(R.string.share_gps_map_title),
        width / 2f,
        28f,
        titlePaint,
    )
    val mapCaptionPaint = Paint().apply {
        color = Color.parseColor("#455A64")
        textSize = 13f
        isAntiAlias = true
        textAlign = Paint.Align.CENTER
    }
    canvas.drawText(
        context.getString(R.string.share_gps_map_caption),
        width / 2f,
        46f,
        mapCaptionPaint,
    )

    val linePaint = Paint().apply {
        isAntiAlias = true
        style = Paint.Style.STROKE
        strokeWidth = 5f
        strokeJoin = Paint.Join.ROUND
        strokeCap = Paint.Cap.ROUND
    }
    val startFill = Paint().apply {
        color = Color.WHITE
        isAntiAlias = true
        style = Paint.Style.FILL
    }
    val startStroke = Paint().apply {
        color = Color.parseColor("#0D47A1")
        isAntiAlias = true
        style = Paint.Style.STROKE
        strokeWidth = 3f
    }
    val startLetter = Paint().apply {
        color = Color.parseColor("#0D47A1")
        textSize = 22f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.CENTER
        isAntiAlias = true
    }
    val finishStroke = Paint().apply {
        color = Color.parseColor("#0D47A1")
        isAntiAlias = true
        style = Paint.Style.STROKE
        strokeWidth = 3f
    }
    val indexOutline = Paint().apply {
        color = Color.WHITE
        textSize = 30f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.CENTER
        isAntiAlias = true
        style = Paint.Style.STROKE
        strokeWidth = 6f
    }
    val indexFill = Paint().apply {
        color = Color.parseColor("#1A237E")
        textSize = 30f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.CENTER
        isAntiAlias = true
    }
    val indexBg = Paint().apply {
        color = Color.WHITE
        isAntiAlias = true
        style = Paint.Style.FILL
    }
    val indexRing = Paint().apply {
        color = Color.parseColor("#0D47A1")
        isAntiAlias = true
        style = Paint.Style.STROKE
        strokeWidth = 3.5f
    }

    valid.forEachIndexed { idx, segment ->
        val color = ROUTE_POLYLINE_COLORS[idx % ROUTE_POLYLINE_COLORS.size]
        linePaint.color = color
        val path = Path()
        segment.forEachIndexed { i, (lat, lon) ->
            val (px, py) = project(lat, lon)
            if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
        }
        canvas.drawPath(path, linePaint)

        val rStart = 19f
        val (sx, sy) = project(segment.first().first, segment.first().second)
        canvas.drawCircle(sx, sy, rStart, startFill)
        canvas.drawCircle(sx, sy, rStart, startStroke)
        canvas.drawText(
            context.getString(R.string.share_route_start),
            sx,
            sy + 8f,
            startLetter,
        )

        val rFin = 19f
        val (fx, fy) = project(segment.last().first, segment.last().second)
        drawCheckeredFinishMarker(canvas, fx, fy, rFin, finishStroke)

        val (mLat, mLon) = latLonAtFractionAlongPolyline(segment, 0.5f)
        val (mx, my) = project(mLat, mLon)
        val label = (idx + 1).toString()
        val rIndex = 26f
        indexRing.color = color
        indexRing.strokeWidth = 4f
        indexFill.color = color
        canvas.drawCircle(mx, my, rIndex, indexBg)
        canvas.drawCircle(mx, my, rIndex, indexRing)
        val fm = indexFill.fontMetrics
        val textBaselineY = my - (fm.ascent + fm.descent) / 2f
        canvas.drawText(label, mx, textBaselineY, indexOutline)
        canvas.drawText(label, mx, textBaselineY, indexFill)
    }

    return bmp
}

private fun drawCheckeredFinishMarker(canvas: Canvas, cx: Float, cy: Float, radius: Float, borderPaint: Paint) {
    canvas.save()
    val clip = Path().apply { addCircle(cx, cy, radius, Path.Direction.CW) }
    canvas.clipPath(clip)
    val span = radius * 2.1f
    val step = span / 5f
    var row = 0
    var y = cy - radius - 1f
    while (y < cy + radius + step) {
        var x = cx - radius - 1f
        var col = 0
        while (x < cx + radius + step) {
            val p = Paint().apply {
                isAntiAlias = true
                style = Paint.Style.FILL
                color = if ((row + col) % 2 == 0) Color.BLACK else Color.WHITE
            }
            canvas.drawRect(x, y, min(x + step, cx + radius + 1f), min(y + step, cy + radius + 1f), p)
            x += step
            col++
        }
        y += step
        row++
    }
    canvas.restore()
    canvas.drawCircle(cx, cy, radius, borderPaint)
}

/**
 * Etiquetas sobre la curva DPS del JPG de resumen (picos, valles y puntos intermedios).
 * No usa la línea de máx/mín/moda.
 */
private fun drawJpegDpsCurveLabels(
    canvas: Canvas,
    points: List<LibreSessionDataPoint>,
    dpsModel: SessionChartLayout.ChartDpsModel,
    maxTime: Float,
    chartLeft: Float,
    chartWidth: Float,
    dpsBandTop: Float,
    dpsBandBottom: Float,
    dpsColor: Int,
    formatLocale: Locale,
) {
    val series = dpsModel.series
    val n = points.size
    if (n == 0 || series.size != n || dpsModel.maxDpsScale <= 0f || dpsModel.strokeCount <= 0) return

    val outline = Paint().apply {
        color = android.graphics.Color.WHITE
        textSize = 9.5f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        isAntiAlias = true
        textAlign = Paint.Align.CENTER
        style = Paint.Style.STROKE
        strokeWidth = 2.8f
    }
    val fill = Paint().apply {
        color = dpsColor
        textSize = 9.5f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        isAntiAlias = true
        textAlign = Paint.Align.CENTER
        style = Paint.Style.FILL
    }

    val iMax = (0 until n).maxByOrNull { series[it] } ?: return
    val iMin = (0 until n).filter { series[it] > 0.05f }.minByOrNull { series[it] }
    val minDist = (n * 0.07f).roundToInt().coerceAtLeast(4)
    val chosen = linkedSetOf<Int>()
    fun canAdd(i: Int): Boolean = chosen.none { abs(it - i) < minDist }

    if (canAdd(iMax)) chosen.add(iMax)
    if (iMin != null && iMin != iMax && canAdd(iMin)) chosen.add(iMin)
    val i50 = n / 2
    if (canAdd(i50)) chosen.add(i50)
    val i75 = (n * 3) / 4
    if (i75 != i50 && canAdd(i75)) chosen.add(i75)
    val i25 = n / 4
    if (canAdd(i25)) chosen.add(i25)

    for (i in chosen.sorted()) {
        val p = points[i]
        val dv = series[i]
        val x = SessionChartLayout.timeToX(p.second.toFloat(), maxTime, chartLeft, chartWidth)
        val y = SessionChartLayout.dpsToY(dv, dpsModel.maxDpsScale, dpsBandBottom, dpsBandTop)
        val txt = String.format(formatLocale, "%.2f", dv)
        val ty = (y - 7f).coerceAtLeast(dpsBandTop + 10f)
        canvas.drawText(txt, x, ty, outline)
        canvas.drawText(txt, x, ty, fill)
    }
}

/** Genera un Bitmap del gráfico: tiempo (X), velocidad (Y izq), SPM (Y der) */
fun createChartBitmap(
    context: Context,
    dataPoints: List<LibreSessionDataPoint>,
    width: Int = 600,
    height: Int = 400
): Bitmap? {
    if (dataPoints.isEmpty()) return null
    return try {
        val locale = context.resources.configuration.getLocales().get(0) ?: Locale.getDefault()
        val strAxisTime = context.getString(R.string.graf_axis_time)
        val strStrokes = context.getString(R.string.train_strokes)
        val strYkmh = context.getString(R.string.train_unit_kmh)
        val strYspm = context.getString(R.string.train_spm)
        val strDpsM = context.getString(R.string.train_unit_m)
        val leg1 = context.getString(R.string.graf_legend_1)
        val leg2 = context.getString(R.string.graf_legend_2)
        val leg3 = context.getString(R.string.graf_legend_3)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(android.graphics.Color.parseColor("#E3F2FD"))

        val maxTime = dataPoints.maxOf { it.second }.toFloat().coerceAtLeast(1f)
        val maxSpeed = dataPoints.maxOf { it.speedKmh }.coerceAtLeast(0.1f)
        val maxSpm = dataPoints.maxOf { it.spm }.coerceAtLeast(1)

        val chartLeft = SessionChartLayout.REF_CHART_LEFT
        val chartRight = width - SessionChartLayout.REF_CHART_LEFT
        val chartWidth = chartRight - chartLeft
        val plotBottom = height - SessionChartLayout.REF_BOTTOM_MARGIN
        val plotTop = SessionChartLayout.REF_PLOT_TOP
        val paladasAxisY = SessionChartLayout.REF_PALADAS_AXIS_Y
        val mainPlotBottom = SessionChartLayout.mainPlotBottomY(plotTop, plotBottom)
        val dpsBandTop = SessionChartLayout.dpsBandTopY(mainPlotBottom, 0f)
        val dpsBandBottom = SessionChartLayout.dpsBandBottomY(plotBottom, 6f)
        val plotHMain = mainPlotBottom - plotTop
        val legY = plotTop + plotHMain * SessionChartLayout.LEGEND_VERTICAL_CENTER_FRACTION

        if (chartWidth <= 0 || plotBottom - plotTop <= 0) return null

        val speedColor = android.graphics.Color.parseColor("#1976D2")
        val spmColor = android.graphics.Color.parseColor("#E65100")
        val dpsColor = android.graphics.Color.parseColor("#7B1FA2")
        val axisBlue = android.graphics.Color.parseColor("#0D47A1")

        val gridVertWeak = Paint().apply {
            color = axisBlue
            alpha = 28
            strokeWidth = 1f
            isAntiAlias = true
        }
        val gridVertMid = Paint().apply {
            color = axisBlue
            alpha = 48
            strokeWidth = 1f
            isAntiAlias = true
        }
        val gridHPaint = Paint().apply {
            color = axisBlue
            alpha = 32
            strokeWidth = 1f
            isAntiAlias = true
        }
        val axisPaint = Paint().apply {
            color = axisBlue
            textSize = 18f
            isAntiAlias = true
            textAlign = Paint.Align.CENTER
        }
        val tickLabelPaint = Paint().apply {
            color = axisBlue
            textSize = 14f
            isAntiAlias = true
        }
        val tickMajorPaint = Paint().apply {
            color = axisBlue
            strokeWidth = 2f
            isAntiAlias = true
        }
        val tickMinorPaint = Paint().apply {
            color = axisBlue
            strokeWidth = 1.2f
            isAntiAlias = true
        }
        val axisLinePaint = Paint().apply {
            color = axisBlue
            strokeWidth = 2f
            isAntiAlias = true
        }

        val points = dataPoints.sortedBy { it.second }
        val dpsModel = SessionChartLayout.buildChartDpsModel(points)
        val maxPal = SessionChartLayout.maxPaladas(points)
        val majorPaladas = SessionChartLayout.majorPaladaTicks(maxPal)
        val minorPaladas = SessionChartLayout.minorPaladaTicks(maxPal, majorPaladas)

        val majorTimes = SessionChartLayout.majorTimeTicks(maxTime)
        val minorTimes = SessionChartLayout.minorTimeTicks(maxTime, majorTimes)

        // Eje X paladas (arriba): cuadrícula vertical por cuartos de cantidad de paladas
        majorPaladas.forEachIndexed { idx, pCount ->
            val x = SessionChartLayout.paladasToX(pCount.toFloat(), points, maxTime, chartLeft, chartWidth)
            val p = if (idx == 0 || idx == majorPaladas.lastIndex) gridVertWeak else gridVertMid
            canvas.drawLine(x, plotTop, x, plotBottom, p)
        }

        val speedTicks = SessionChartLayout.buildSpeedAxisTicks(points, maxSpeed)
        speedTicks.forEach { v ->
            val y = SessionChartLayout.speedToY(v, maxSpeed, mainPlotBottom, plotTop)
            canvas.drawLine(chartLeft, y, chartRight, y, gridHPaint)
        }
        if (dpsBandBottom > dpsBandTop + 2f && dpsModel.maxDpsScale > 0f) {
            val yHalf = SessionChartLayout.dpsToY(dpsModel.maxDpsScale * 0.5f, dpsModel.maxDpsScale, dpsBandBottom, dpsBandTop)
            val hHalf = Paint(gridHPaint).apply { alpha = 22 }
            canvas.drawLine(chartLeft, yHalf, chartRight, yHalf, hHalf)
        }

        // Eje X inferior (tiempo)
        canvas.drawLine(chartLeft, plotBottom, chartRight, plotBottom, axisLinePaint)
        minorTimes.forEach { tSec ->
            val x = SessionChartLayout.timeToX(tSec, maxTime, chartLeft, chartWidth)
            canvas.drawLine(x, plotBottom, x, plotBottom + 6f, tickMinorPaint)
        }
        tickLabelPaint.textAlign = Paint.Align.CENTER
        majorTimes.forEach { tSec ->
            val x = SessionChartLayout.timeToX(tSec, maxTime, chartLeft, chartWidth)
            canvas.drawLine(x, plotBottom, x, plotBottom + 12f, tickMajorPaint)
            canvas.drawText(tSec.roundToInt().toString(), x, plotBottom + 22f, tickLabelPaint)
        }
        axisPaint.textAlign = Paint.Align.CENTER
        axisPaint.textSize = 16f
        canvas.drawText(strAxisTime, (chartLeft + chartRight) / 2f, height - 6f, axisPaint)

        val paladasCaptionPaint = Paint(axisPaint).apply { textSize = 15f }

        val tickLabelMinorPaint = Paint(tickLabelPaint).apply { textSize = 11f }
        fun formatPaladasTick(p: Float): String =
            if (abs(p - p.roundToInt()) < 0.08f) p.roundToInt().toString()
            else String.format(locale, "%.0f", p)

        // Eje X paladas (arriba): línea y marcas hacia arriba
        canvas.drawLine(chartLeft, paladasAxisY, chartRight, paladasAxisY, axisLinePaint)
        val majorPalXs = majorPaladas.map { pCount ->
            SessionChartLayout.paladasToX(pCount.toFloat(), points, maxTime, chartLeft, chartWidth)
        }
        minorPaladas.forEach { pF ->
            val x = SessionChartLayout.paladasToX(pF, points, maxTime, chartLeft, chartWidth)
            canvas.drawLine(x, paladasAxisY, x, paladasAxisY - 6f, tickMinorPaint)
        }
        majorPaladas.forEachIndexed { i, pCount ->
            val x = majorPalXs[i]
            canvas.drawLine(x, paladasAxisY, x, paladasAxisY - 12f, tickMajorPaint)
            canvas.drawText(pCount.toString(), x, paladasAxisY - 14f, tickLabelPaint)
        }
        tickLabelMinorPaint.textAlign = Paint.Align.CENTER
        minorPaladas.forEach { pF ->
            val x = SessionChartLayout.paladasToX(pF, points, maxTime, chartLeft, chartWidth)
            if (majorPalXs.none { abs(it - x) < 14f }) {
                canvas.drawText(formatPaladasTick(pF), x, paladasAxisY - 12f, tickLabelMinorPaint)
            }
        }
        paladasCaptionPaint.textAlign = Paint.Align.CENTER
        canvas.drawText(
            strStrokes,
            (chartLeft + chartRight) / 2f,
            paladasAxisY + SessionChartLayout.REF_PALADAS_CAPTION_OFFSET,
            paladasCaptionPaint
        )

        // Ejes Y (altura completa; DPS en la parte inferior del mismo rectángulo)
        canvas.drawLine(chartLeft, plotTop, chartLeft, plotBottom, axisLinePaint)
        canvas.drawLine(chartRight, plotTop, chartRight, plotBottom, axisLinePaint)
        val mainSepPaint = Paint(gridHPaint).apply { strokeWidth = 1f }
        canvas.drawLine(chartLeft, mainPlotBottom, chartRight, mainPlotBottom, mainSepPaint)

        // Marcas eje velocidad (izq)
        tickLabelPaint.textAlign = Paint.Align.RIGHT
        speedTicks.forEach { v ->
            val y = SessionChartLayout.speedToY(v, maxSpeed, mainPlotBottom, plotTop)
            val isMax = abs(v - maxSpeed) < 0.01f
            val isZero = v < 0.01f
            val len = when {
                isMax || isZero -> 12f
                else -> 9f
            }
            canvas.drawLine(chartLeft - len, y, chartLeft, y, tickMajorPaint)
            val txt = String.format(locale, "%.1f", v)
            canvas.drawText(txt, chartLeft - 16f, y + 5f, tickLabelPaint)
        }

        if (dpsBandBottom > dpsBandTop + 2f && dpsModel.maxDpsScale > 0f) {
            val dpsAxisTickPaint = Paint().apply {
                color = dpsColor
                textSize = 10f
                isAntiAlias = true
                textAlign = Paint.Align.RIGHT
            }
            val dpsTickLen = 8f
            tickMajorPaint.strokeWidth = 1.2f
            canvas.drawLine(chartLeft - dpsTickLen, dpsBandBottom, chartLeft, dpsBandBottom, tickMajorPaint)
            canvas.drawText("0", chartLeft - 12f, dpsBandBottom + 4f, dpsAxisTickPaint)
            canvas.drawLine(chartLeft - dpsTickLen, dpsBandTop, chartLeft, dpsBandTop, tickMajorPaint)
            val dpsMaxLbl = String.format(locale, "%.2f", dpsModel.maxDpsScale)
            canvas.drawText(dpsMaxLbl, chartLeft - 12f, dpsBandTop + 4f, dpsAxisTickPaint)
            dpsAxisTickPaint.textSize = 9f
            dpsAxisTickPaint.textAlign = Paint.Align.CENTER
            canvas.drawText(
                strDpsM,
                chartLeft - 22f,
                (dpsBandTop + dpsBandBottom) / 2f,
                dpsAxisTickPaint,
            )
            tickMajorPaint.strokeWidth = 2f
        }

        // Marcas eje SPM (der): cuartiles + máximo más largo
        tickLabelPaint.textAlign = Paint.Align.LEFT
        val spmTicks = SessionChartLayout.buildSpmAxisTicks(maxSpm)
        val spmHalf = (maxSpm * 0.5f).roundToInt().coerceIn(0, maxSpm)
        spmTicks.forEach { s ->
            val y = SessionChartLayout.spmToY(s, maxSpm, mainPlotBottom, plotTop)
            val isMajor = s == 0 || s == maxSpm || s == spmHalf
            val len = if (isMajor) 12f else 7f
            canvas.drawLine(chartRight, y, chartRight + len, y, if (isMajor) tickMajorPaint else tickMinorPaint)
            canvas.drawText(s.toString(), chartRight + 16f, y + 5f, tickLabelPaint)
        }

        val yUnitPaint = Paint().apply {
            color = axisBlue
            textSize = 13f
            isAntiAlias = true
            textAlign = Paint.Align.CENTER
        }
        val off = SessionChartLayout.REF_Y_AXIS_LABEL_OFFSET
        val midY = (plotTop + mainPlotBottom) / 2f
        canvas.save()
        canvas.translate(chartLeft - off, midY)
        canvas.rotate(-90f)
        val fmL = yUnitPaint.fontMetrics
        canvas.drawText(strYkmh, 0f, -(fmL.ascent + fmL.descent) / 2f, yUnitPaint)
        canvas.restore()
        canvas.save()
        canvas.translate(chartRight + off, midY)
        canvas.rotate(-90f)
        val fmR = yUnitPaint.fontMetrics
        canvas.drawText(strYspm, 0f, -(fmR.ascent + fmR.descent) / 2f, yUnitPaint)
        canvas.restore()

        // Líneas de datos velocidad / SPM
        val speedPath = Path()
        for (i in points.indices) {
            val p = points[i]
            val x = SessionChartLayout.timeToX(p.second.toFloat(), maxTime, chartLeft, chartWidth)
            val y = SessionChartLayout.speedToY(p.speedKmh, maxSpeed, mainPlotBottom, plotTop)
            if (i == 0) speedPath.moveTo(x, y) else speedPath.lineTo(x, y)
        }
        canvas.drawPath(speedPath, Paint().apply {
            color = speedColor
            strokeWidth = 3f
            style = Paint.Style.STROKE
            isAntiAlias = true
        })

        val spmPath = Path()
        for (i in points.indices) {
            val p = points[i]
            val x = SessionChartLayout.timeToX(p.second.toFloat(), maxTime, chartLeft, chartWidth)
            val y = SessionChartLayout.spmToY(p.spm, maxSpm, mainPlotBottom, plotTop)
            if (i == 0) spmPath.moveTo(x, y) else spmPath.lineTo(x, y)
        }
        canvas.drawPath(spmPath, Paint().apply {
            color = spmColor
            strokeWidth = 3f
            style = Paint.Style.STROKE
            isAntiAlias = true
        })

        if (dpsBandBottom > dpsBandTop + 2f && dpsModel.series.size == points.size && dpsModel.maxDpsScale > 0f) {
            val dpsPath = Path()
            for (i in points.indices) {
                val p = points[i]
                val x = SessionChartLayout.timeToX(p.second.toFloat(), maxTime, chartLeft, chartWidth)
                val dv = dpsModel.series.getOrElse(i) { 0f }
                val y = SessionChartLayout.dpsToY(dv, dpsModel.maxDpsScale, dpsBandBottom, dpsBandTop)
                if (i == 0) dpsPath.moveTo(x, y) else dpsPath.lineTo(x, y)
            }
            canvas.drawPath(dpsPath, Paint().apply {
                color = dpsColor
                strokeWidth = 2.5f
                style = Paint.Style.STROKE
                isAntiAlias = true
            })
            drawJpegDpsCurveLabels(
                canvas = canvas,
                points = points,
                dpsModel = dpsModel,
                maxTime = maxTime,
                chartLeft = chartLeft,
                chartWidth = chartWidth,
                dpsBandTop = dpsBandTop,
                dpsBandBottom = dpsBandBottom,
                dpsColor = dpsColor,
                formatLocale = locale,
            )
        }

        val fillSpeed = Paint().apply { color = speedColor; isAntiAlias = true; style = Paint.Style.FILL }
        val fillSpm = Paint().apply { color = spmColor; isAntiAlias = true; style = Paint.Style.FILL }
        val fillDps = Paint().apply { color = dpsColor; isAntiAlias = true; style = Paint.Style.FILL }
        val legPaint = Paint().apply {
            color = axisBlue
            textSize = 15f
            textAlign = Paint.Align.LEFT
            isAntiAlias = true
        }
        val cirR = 6f
        val cx = width / 2f
        var lx = cx - 128f
        canvas.drawCircle(lx, legY, cirR, fillSpeed)
        canvas.drawText(leg1, lx + cirR + 8f, legY + 6f, legPaint)
        lx = cx - 8f
        canvas.drawCircle(lx, legY, cirR, fillSpm)
        canvas.drawText(leg2, lx + cirR + 8f, legY + 6f, legPaint)
        lx = cx + 112f
        canvas.drawCircle(lx, legY, cirR, fillDps)
        canvas.drawText(leg3, lx + cirR + 8f, legY + 6f, legPaint)

        bitmap
    } catch (_: Exception) {
        null
    }
}

/**
 * Imagen tipo resumen Libre (tabla + gráfico) a partir de un JSON guardado en Gráficos.
 * [horarioLabel] suele ser fecha/hora del archivo (p. ej. dd/MM/yyyy HH:mm).
 */
fun createShareImageFromRecordedSession(
    context: Context,
    session: LibreSessionJson,
    horarioLabel: String
): java.io.File? {
    val pts = session.dataPoints
    if (pts.isEmpty()) return null
    val sorted = pts.sortedBy { it.second }
    val totalSeconds = session.totalSeconds.takeIf { it > 0 } ?: sorted.maxOf { it.second }
    val last = sorted.maxBy { it.second }
    val totalDistanceM = last.distanceMeters
    val totalPaladas = last.paladas
    val maxSpeedKmh = sorted.maxOf { it.speedKmh }
    val hours = totalSeconds / 3600f
    val avgSpeedKmh = if (hours > 1e-6f) (totalDistanceM / 1000f) / hours else 0f
    val subtitle = session.metadataLine(context)
    return createSummaryImage(
        context,
        totalSeconds,
        totalDistanceM,
        totalPaladas,
        maxSpeedKmh,
        avgSpeedKmh,
        title = context.getString(R.string.libre_share_image_title),
        subtitle = subtitle,
        chartDataPoints = sorted,
        trainingStartIso = session.sessionStartTime.takeIf { it.isNotBlank() },
        trainingFallbackHumanDate = horarioLabel.takeIf { it.isNotBlank() }
    )
}

fun createSummaryImage(
    context: Context,
    totalSeconds: Long,
    totalDistanceM: Float,
    totalPaladas: Int,
    maxSpeedKmh: Float,
    avgSpeedKmh: Float,
    title: String,
    subtitle: String,
    chartDataPoints: List<LibreSessionDataPoint>? = null,
    /**
     * Fecha/hora de inicio del entrenamiento (ISO-8601). Se muestra en la tercera línea del encabezado
     * (donde antes decía "Resumen"). Si es null o inválido, se usa la fecha/hora actual del dispositivo.
     */
    trainingStartIso: String? = null,
    /** Si [trainingStartIso] falta o no parsea (p. ej. JSON antiguo), usar esta línea tal cual (p. ej. dd/MM/yyyy HH:mm). */
    trainingFallbackHumanDate: String? = null,
    /**
     * Varios recorridos GPS (p. ej. resumen del día con varios JSON). Cada lista es lat/lon en orden.
     * Si es null o vacío, se intenta un solo trazo desde [chartDataPoints].
     */
    gpsRouteGroups: List<List<Pair<Double, Double>>>? = null,
): java.io.File? {
    return try {
        val width = 600
        val height = 565
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        canvas.drawColor(android.graphics.Color.parseColor("#E3F2FD"))

        val titlePaint = Paint().apply {
            color = android.graphics.Color.parseColor("#0D47A1")
            textSize = 48f
            isAntiAlias = true
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
        }
        val subPaint = Paint().apply {
            color = android.graphics.Color.parseColor("#0D47A1")
            textSize = 28f
            isAntiAlias = true
            textAlign = Paint.Align.CENTER
        }
        val labelPaint = Paint().apply {
            color = android.graphics.Color.parseColor("#42A5F5")
            textSize = 24f
            isAntiAlias = true
            textAlign = Paint.Align.LEFT
        }
        val valuePaint = Paint().apply {
            color = android.graphics.Color.parseColor("#0D47A1")
            textSize = 24f
            isAntiAlias = true
            typeface = Typeface.DEFAULT_BOLD
            textAlign = Paint.Align.RIGHT
        }

        canvas.drawText(title, width / 2f, 80f, titlePaint)
        if (subtitle.isNotBlank()) {
            canvas.drawText(subtitle, width / 2f, 120f, subPaint)
        }
        val trainingLine = resolveTrainingDateTimeLine(
            context,
            trainingStartIso,
            trainingFallbackHumanDate,
        )
        canvas.drawText(trainingLine, width / 2f, 180f, subPaint)

        labelPaint.color = android.graphics.Color.parseColor("#0D47A1")
        valuePaint.color = android.graphics.Color.parseColor("#1A237E")

        val loc = appLocale(context)
        val nfInt = NumberFormat.getIntegerInstance(loc)
        val nfDec2 = NumberFormat.getNumberInstance(loc).apply {
            minimumFractionDigits = 2
            maximumFractionDigits = 2
        }

        val dpsMeters = if (totalPaladas > 0) totalDistanceM / totalPaladas.toFloat() else 0f

        var y = 250f
        canvas.drawText(context.getString(R.string.ej_total_time), 80f, y, labelPaint)
        canvas.drawText(
            "${nfInt.format(totalSeconds)} ${context.getString(R.string.train_unit_sec)}",
            width - 80f,
            y,
            valuePaint,
        )
        y += 45f
        canvas.drawText(context.getString(R.string.ej_time_hhmmss), 80f, y, labelPaint)
        val h = totalSeconds / 3600
        val m = (totalSeconds % 3600) / 60
        val s = totalSeconds % 60
        canvas.drawText(String.format("%02d:%02d:%02d", h, m, s), width - 80f, y, valuePaint)
        y += 45f
        canvas.drawText(context.getString(R.string.ej_total_distance), 80f, y, labelPaint)
        canvas.drawText(
            context.getString(
                R.string.ej_value_meters,
                nfInt.format(totalDistanceM.toLong()),
            ),
            width - 80f,
            y,
            valuePaint,
        )
        y += 45f
        canvas.drawText(context.getString(R.string.ej_total_strokes), 80f, y, labelPaint)
        canvas.drawText(nfInt.format(totalPaladas), width - 80f, y, valuePaint)
        y += 45f
        canvas.drawText(context.getString(R.string.share_dps_avg), 80f, y, labelPaint)
        canvas.drawText(
            context.getString(
                R.string.ej_value_meters,
                nfDec2.format(dpsMeters.toDouble()),
            ),
            width - 80f,
            y,
            valuePaint,
        )
        y += 45f
        canvas.drawText(context.getString(R.string.ej_max_speed), 80f, y, labelPaint)
        canvas.drawText(
            context.getString(
                R.string.ej_value_kmh,
                nfDec2.format(maxSpeedKmh.toDouble()),
            ),
            width - 80f,
            y,
            valuePaint,
        )
        y += 45f
        canvas.drawText(context.getString(R.string.ej_avg_speed), 80f, y, labelPaint)
        canvas.drawText(
            context.getString(
                R.string.ej_value_kmh,
                nfDec2.format(avgSpeedKmh.toDouble()),
            ),
            width - 80f,
            y,
            valuePaint,
        )

        val calendar = java.util.Calendar.getInstance()
        val day = String.format("%02d", calendar.get(java.util.Calendar.DAY_OF_MONTH))
        val month = String.format("%02d", calendar.get(java.util.Calendar.MONTH) + 1)
        val yearShort = String.format("%02d", calendar.get(java.util.Calendar.YEAR) % 100)
        val fileName = "db-$day-$month-$yearShort.jpg"

        val routesForMap: List<List<Pair<Double, Double>>> =
            if (!gpsRouteGroups.isNullOrEmpty()) {
                gpsRouteGroups.filter { it.size >= 2 }
            } else {
                chartDataPoints?.let { pts ->
                    val seg = extractGpsPolylineFromDataPoints(pts)
                    if (seg.size >= 2) listOf(seg) else emptyList()
                } ?: emptyList()
            }

        var finalBitmap = bitmap
        if (!chartDataPoints.isNullOrEmpty()) {
            val chartBitmap = createChartBitmap(context, chartDataPoints, width, 380)
            if (chartBitmap != null) {
                val combined = appendBitmapVertically(finalBitmap, chartBitmap, width)
                if (finalBitmap !== bitmap) finalBitmap.recycle() else bitmap.recycle()
                finalBitmap = combined
                chartBitmap.recycle()
            }
        }
        if (routesForMap.isNotEmpty()) {
            createGpsRouteMapBitmap(
                context,
                width,
                ROUTE_MAP_HEIGHT_PX,
                routesForMap,
            )?.let { mapBitmap ->
                val combined = appendBitmapVertically(finalBitmap, mapBitmap, width)
                if (finalBitmap !== bitmap) finalBitmap.recycle() else bitmap.recycle()
                finalBitmap = combined
                mapBitmap.recycle()
            }
        }

        val file = java.io.File(context.cacheDir, fileName)
        java.io.FileOutputStream(file).use { out ->
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
        }
        if (finalBitmap != bitmap) finalBitmap.recycle()
        file
    } catch (e: Exception) {
        null
    }
}

fun shareSummaryImage(context: Context, file: java.io.File) {
    try {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/jpeg"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(
            Intent.createChooser(intent, context.getString(R.string.share_chooser)),
        )
    } catch (e: Exception) {
        // Ignorar si no hay app para compartir
    }
}

private fun appLocale(context: Context): Locale =
    context.resources.configuration.getLocales().get(0) ?: Locale.getDefault()

private fun dateTimeForShareImageFormat(context: Context): DateTimeFormatter =
    DateTimeFormatter.ofLocalizedDateTime(FormatStyle.FULL, FormatStyle.SHORT)
        .withLocale(appLocale(context))

private fun formatTrainingInstantIsoForImage(iso: String, context: Context): String {
    if (iso.isBlank()) return ""
    val zid = ZoneId.systemDefault()
    val zoned = try {
        try {
            Instant.parse(iso).atZone(zid)
        } catch (_: Exception) {
            try {
                ZonedDateTime.parse(iso).withZoneSameInstant(zid)
            } catch (_: Exception) {
                try {
                    OffsetDateTime.parse(iso).atZoneSameInstant(zid)
                } catch (_: Exception) {
                    val core = iso.trim().substringBefore('.').take(19)
                    LocalDateTime.parse(core).atZone(zid)
                }
            }
        }
    } catch (_: Exception) {
        return ""
    }
    val raw = zoned.format(dateTimeForShareImageFormat(context))
    if (raw.isEmpty()) return ""
    return raw.replaceFirstChar { c -> if (c.isLowerCase()) c.titlecase(appLocale(context)) else c.toString() }
}

private fun buildCalendarLongDateTimeLine(context: Context): String {
    return ZonedDateTime.now(ZoneId.systemDefault()).format(dateTimeForShareImageFormat(context))
}

private fun resolveTrainingDateTimeLine(
    context: Context,
    trainingStartIso: String?,
    trainingFallbackHumanDate: String?
): String {
    if (!trainingStartIso.isNullOrBlank()) {
        val fromIso = formatTrainingInstantIsoForImage(trainingStartIso.trim(), context)
        if (fromIso.isNotBlank()) return fromIso
    }
    if (!trainingFallbackHumanDate.isNullOrBlank()) return trainingFallbackHumanDate.trim()
    return buildCalendarLongDateTimeLine(context)
}
