package com.example.minidboat.ui.graficos

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.minidboat.R
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.SkyLight
import com.example.minidboat.ui.theme.SkyPale
import com.example.minidboat.ui.theme.WaveWhite
import com.example.minidboat.util.ChartSessionAnalysis
import com.example.minidboat.util.LibreSessionFileInfo
import com.example.minidboat.util.analyzeSessionChart
import com.example.minidboat.util.LibreSessionRepository
import com.example.minidboat.util.SessionChartLayout
import com.example.minidboat.util.createShareImageFromRecordedSession
import com.example.minidboat.util.shareSummaryImage
import com.example.minidboat.viewmodel.GraficosViewModel
import com.example.minidboat.viewmodel.LibreSessionDataPoint
import com.example.minidboat.viewmodel.metadataLine
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import android.graphics.Paint as AndroidPaint
import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GraficosScreen(
    onBack: () -> Unit,
    viewModel: GraficosViewModel = viewModel(
        factory = GraficosViewModel.Factory(LocalContext.current.applicationContext)
    )
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var filePendingDelete by remember { mutableStateOf<LibreSessionFileInfo?>(null) }
    var pendingDeleteAll by remember { mutableStateOf(false) }
    var chartAnalysisDialog by remember { mutableStateOf<ChartSessionAnalysis?>(null) }

    val gradientBackground = Brush.verticalGradient(
        colors = listOf(WaveWhite, SkyPale.copy(alpha = 0.6f))
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.graf_title),
                        fontWeight = FontWeight.Bold,
                        color = OceanDeep
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = stringResource(R.string.config_back),
                            tint = OceanDeep
                        )
                    }
                },
                colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(
                    containerColor = SkyLight.copy(alpha = 0.9f),
                    titleContentColor = OceanDeep
                )
            )
        }
    ) { padding ->
        filePendingDelete?.let { info ->
            AlertDialog(
                onDismissRequest = { filePendingDelete = null },
                title = { Text(stringResource(R.string.graf_delete_session_title)) },
                text = { Text(stringResource(R.string.graf_delete_session_body)) },
                confirmButton = {
                    TextButton(
                        onClick = {
                            viewModel.deleteFile(info)
                            filePendingDelete = null
                        }
                    ) {
                        Text(
                            stringResource(R.string.action_delete),
                            color = Color(0xFFC62828),
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                },
                dismissButton = {
                    TextButton(onClick = { filePendingDelete = null }) {
                        Text(stringResource(R.string.action_cancel))
                    }
                }
            )
        }
        chartAnalysisDialog?.let { analysis ->
            AlertDialog(
                onDismissRequest = { chartAnalysisDialog = null },
                title = {
                    Text(
                        stringResource(R.string.graf_analysis_title),
                        fontWeight = FontWeight.Bold,
                        color = OceanDeep
                    )
                },
                text = {
                    Column(
                        modifier = Modifier
                            .verticalScroll(rememberScrollState())
                            .height(360.dp)
                    ) {
                        Text(
                            stringResource(R.string.graf_analysis_hits),
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF2E7D32),
                            style = MaterialTheme.typography.titleSmall
                        )
                        analysis.aciertos.forEach { line ->
                            Text(
                                "· $line",
                                style = MaterialTheme.typography.bodySmall,
                                color = OceanDeep,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            stringResource(R.string.graf_analysis_review),
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFC62828),
                            style = MaterialTheme.typography.titleSmall
                        )
                        analysis.errores.forEach { line ->
                            Text(
                                "· $line",
                                style = MaterialTheme.typography.bodySmall,
                                color = OceanDeep,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            stringResource(R.string.graf_analysis_improve),
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF1565C0),
                            style = MaterialTheme.typography.titleSmall
                        )
                        analysis.mejoras.forEach { line ->
                            Text(
                                "· $line",
                                style = MaterialTheme.typography.bodySmall,
                                color = OceanDeep,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            stringResource(R.string.graf_analysis_disclaimer),
                            style = MaterialTheme.typography.labelSmall,
                            color = OceanDeep.copy(alpha = 0.65f)
                        )
                    }
                },
                confirmButton = {
                    TextButton(onClick = { chartAnalysisDialog = null }) {
                        Text(
                            stringResource(R.string.action_close),
                            color = OceanDeep,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            )
        }
        if (pendingDeleteAll) {
            AlertDialog(
                onDismissRequest = { pendingDeleteAll = false },
                title = { Text(stringResource(R.string.graf_delete_all_title)) },
                text = { Text(stringResource(R.string.graf_delete_all_body, state.files.size)) },
                confirmButton = {
                    TextButton(
                        onClick = {
                            viewModel.deleteAllFiles()
                            pendingDeleteAll = false
                        }
                    ) {
                        Text(
                            stringResource(R.string.action_delete_all),
                            color = Color(0xFFC62828),
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                },
                dismissButton = {
                    TextButton(onClick = { pendingDeleteAll = false }) {
                        Text(stringResource(R.string.action_cancel))
                    }
                }
            )
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(gradientBackground)
                .padding(padding)
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.graf_recorded_sessions),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = OceanDeep
                )
                if (!state.loading && state.files.isNotEmpty()) {
                    TextButton(onClick = { pendingDeleteAll = true }) {
                        Text(stringResource(R.string.action_delete_all), color = Color(0xFFC62828))
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))

            if (state.loading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(stringResource(R.string.graf_loading), color = OceanDeep)
                }
            } else if (state.files.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.graf_empty_sessions),
                        color = OceanDeep.copy(alpha = 0.7f),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(0.4f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(state.files.size) { index ->
                        val fileInfo = state.files[index]
                        SessionFileItem(
                            fileInfo = fileInfo,
                            isSelected = state.selectedFile?.fileName == fileInfo.fileName,
                            onClick = { viewModel.selectFile(fileInfo) },
                            onDelete = { filePendingDelete = fileInfo }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                when {
                    state.selectedSession != null -> {
                        val session = state.selectedSession!!
                        Text(
                            text = session.metadataLine(context),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = OceanDeep
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = stringResource(R.string.graf_chart_title),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = OceanDeep,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = { chartAnalysisDialog = analyzeSessionChart(context, session.dataPoints) },
                                modifier = Modifier.size(40.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Info,
                                    contentDescription = stringResource(R.string.graf_cd_analysis),
                                    tint = OceanDeep.copy(alpha = 0.9f)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        SessionChart(
                            modifier = Modifier
                                .weight(0.6f)
                                .fillMaxWidth(),
                            dataPoints = session.dataPoints
                        )
                    }
                    state.selectedFile != null -> {
                        Box(
                            modifier = Modifier
                                .weight(0.6f)
                                .fillMaxWidth()
                                .border(1.dp, OceanDeep.copy(alpha = 0.2f), RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = stringResource(R.string.graf_json_error),
                                color = OceanDeep.copy(alpha = 0.65f),
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(16.dp)
                            )
                        }
                    }
                    else -> {
                        Box(
                            modifier = Modifier
                                .weight(0.6f)
                                .fillMaxWidth()
                                .border(1.dp, OceanDeep.copy(alpha = 0.2f), RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = stringResource(R.string.graf_select_session),
                                color = OceanDeep.copy(alpha = 0.5f),
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SessionFileItem(
    fileInfo: LibreSessionFileInfo,
    isSelected: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    val context = LocalContext.current
    val cdShare = stringResource(R.string.graf_cd_share_chart)
    val cdDelete = stringResource(R.string.graf_cd_delete_session)
    val dateStr = try {
        SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())
            .format(Date(fileInfo.lastModified))
    } catch (_: Exception) {
        fileInfo.fileName
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) OceanDeep.copy(alpha = 0.15f) else SkyLight.copy(alpha = 0.5f)
        ),
        border = if (isSelected) {
            androidx.compose.foundation.BorderStroke(2.dp, OceanDeep)
        } else null
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.InsertDriveFile,
                contentDescription = null,
                tint = OceanDeep,
                modifier = Modifier.size(32.dp)
            )
            Spacer(modifier = Modifier.size(12.dp))
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable(onClick = onClick)
            ) {
                Text(
                    text = dateStr,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = OceanDeep
                )
                Text(
                    text = fileInfo.fileName,
                    style = MaterialTheme.typography.bodySmall,
                    color = OceanDeep.copy(alpha = 0.6f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            IconButton(
                onClick = {
                    val sess = LibreSessionRepository.loadSession(fileInfo.file) ?: return@IconButton
                    createShareImageFromRecordedSession(context, sess, dateStr)?.let { shareSummaryImage(context, it) }
                },
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Share,
                    contentDescription = cdShare,
                    tint = OceanDeep.copy(alpha = 0.8f)
                )
            }
            IconButton(
                onClick = onDelete,
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = cdDelete,
                    tint = OceanDeep.copy(alpha = 0.8f)
                )
            }
        }
    }
}

@Composable
fun SessionChart(
    modifier: Modifier = Modifier,
    dataPoints: List<LibreSessionDataPoint>
) {
    val emptyDatapointsText = stringResource(R.string.graf_no_datapoints)
    val paladasTitle = stringResource(R.string.train_strokes)
    val legend1 = stringResource(R.string.graf_legend_1)
    val legend2 = stringResource(R.string.graf_legend_2)
    val legend3 = stringResource(R.string.graf_legend_3)
    val axisTime = stringResource(R.string.graf_axis_time)
    val yKmh = stringResource(R.string.train_unit_kmh)
    val ySpm = stringResource(R.string.train_spm)
    val dpsM = stringResource(R.string.train_unit_m)
    val dpsLineFmt = stringResource(R.string.graf_dps_stats_line)
    val dpsNoIncr = stringResource(R.string.graf_dps_no_increments)
    val numberLocale = remember { Locale.getDefault() }
    if (dataPoints.isEmpty()) {
        Box(
            modifier = modifier
                .padding(8.dp)
                .border(1.dp, OceanDeep.copy(alpha = 0.3f), RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = emptyDatapointsText,
                color = OceanDeep.copy(alpha = 0.65f),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(16.dp)
            )
        }
        return
    }

    val points = remember(dataPoints) { dataPoints.sortedBy { it.second } }
    val maxTime = remember(points) { points.maxOf { it.second }.toFloat().coerceAtLeast(1f) }
    val maxSpeed = remember(points) { points.maxOf { it.speedKmh }.coerceAtLeast(0.1f) }
    val maxSpm = remember(points) { points.maxOf { it.spm }.coerceAtLeast(1) }
    val majorTimes = remember(maxTime) { SessionChartLayout.majorTimeTicks(maxTime) }
    val minorTimes = remember(maxTime, majorTimes) { SessionChartLayout.minorTimeTicks(maxTime, majorTimes) }
    val maxPal = remember(points) { SessionChartLayout.maxPaladas(points) }
    val majorPaladas = remember(maxPal) { SessionChartLayout.majorPaladaTicks(maxPal) }
    val minorPaladas = remember(maxPal, majorPaladas) { SessionChartLayout.minorPaladaTicks(maxPal, majorPaladas) }
    val speedTicks = remember(points, maxSpeed) { SessionChartLayout.buildSpeedAxisTicks(points, maxSpeed) }
    val spmTicks = remember(maxSpm) { SessionChartLayout.buildSpmAxisTicks(maxSpm) }
    val spmHalf = remember(maxSpm) { (maxSpm * 0.5f).roundToInt().coerceIn(0, maxSpm) }
    val dpsModel = remember(points) { SessionChartLayout.buildChartDpsModel(points) }

    val axisBlue = Color(0xFF0D47A1)
    val speedColor = Color(0xFF1976D2)
    val spmColor = Color(0xFFE65100)
    val dpsColor = Color(0xFF7B1FA2)
    val chartBg = Color(0xFFE3F2FD)

    Canvas(
        modifier = modifier
            .padding(8.dp)
            .border(1.dp, OceanDeep.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
    ) {
        val sx = size.width / 600f
        val sy = size.height / 400f
        val chartLeft = SessionChartLayout.REF_CHART_LEFT * sx
        val chartRight = size.width - SessionChartLayout.REF_CHART_LEFT * sx
        val plotBottom = size.height - SessionChartLayout.REF_BOTTOM_MARGIN * sy
        val plotTop = SessionChartLayout.REF_PLOT_TOP * sy
        val paladasAxisY = SessionChartLayout.REF_PALADAS_AXIS_Y * sy
        val paladasCaptionY = paladasAxisY + SessionChartLayout.REF_PALADAS_CAPTION_OFFSET * sy
        val mainPlotBottom = SessionChartLayout.mainPlotBottomY(plotTop, plotBottom)
        val dpsBandTop = SessionChartLayout.dpsBandTopY(mainPlotBottom, 0f)
        val dpsBandBottom = SessionChartLayout.dpsBandBottomY(plotBottom, 6f * sy)
        val plotHMain = mainPlotBottom - plotTop
        val legY = plotTop + plotHMain * SessionChartLayout.LEGEND_VERTICAL_CENTER_FRACTION
        val chartWidth = chartRight - chartLeft

        if (chartWidth <= 0f || plotBottom - plotTop <= 0f) return@Canvas

        drawRect(color = chartBg, size = size)

        val gridWeak = axisBlue.copy(alpha = 0.11f)
        val gridMid = axisBlue.copy(alpha = 0.19f)
        val gridH = axisBlue.copy(alpha = 0.13f)

        majorPaladas.forEachIndexed { idx, pCount ->
            val x = SessionChartLayout.paladasToX(pCount.toFloat(), points, maxTime, chartLeft, chartWidth)
            val col = if (idx == 0 || idx == majorPaladas.lastIndex) gridWeak else gridMid
            drawLine(col, Offset(x, plotTop), Offset(x, plotBottom), strokeWidth = 1f)
        }
        speedTicks.forEach { v ->
            val y = SessionChartLayout.speedToY(v, maxSpeed, mainPlotBottom, plotTop)
            drawLine(gridH, Offset(chartLeft, y), Offset(chartRight, y), strokeWidth = 1f)
        }
        if (dpsBandBottom > dpsBandTop + 2f && dpsModel.maxDpsScale > 0f) {
            val yHalf = SessionChartLayout.dpsToY(dpsModel.maxDpsScale * 0.5f, dpsModel.maxDpsScale, dpsBandBottom, dpsBandTop)
            drawLine(gridH.copy(alpha = 0.09f), Offset(chartLeft, yHalf), Offset(chartRight, yHalf), strokeWidth = 1f)
        }

        // Eje X inferior (tiempo)
        drawLine(axisBlue, androidx.compose.ui.geometry.Offset(chartLeft, plotBottom), androidx.compose.ui.geometry.Offset(chartRight, plotBottom), strokeWidth = 2f)
        minorTimes.forEach { tSec ->
            val x = SessionChartLayout.timeToX(tSec, maxTime, chartLeft, chartWidth)
            drawLine(axisBlue, androidx.compose.ui.geometry.Offset(x, plotBottom), androidx.compose.ui.geometry.Offset(x, plotBottom + 6f * sy), strokeWidth = 1.2f)
        }
        majorTimes.forEach { tSec ->
            val x = SessionChartLayout.timeToX(tSec, maxTime, chartLeft, chartWidth)
            drawLine(axisBlue, androidx.compose.ui.geometry.Offset(x, plotBottom), androidx.compose.ui.geometry.Offset(x, plotBottom + 12f * sy), strokeWidth = 2f)
        }

        // Eje X paladas (arriba)
        drawLine(axisBlue, androidx.compose.ui.geometry.Offset(chartLeft, paladasAxisY), androidx.compose.ui.geometry.Offset(chartRight, paladasAxisY), strokeWidth = 2f)
        minorPaladas.forEach { pF ->
            val x = SessionChartLayout.paladasToX(pF, points, maxTime, chartLeft, chartWidth)
            drawLine(axisBlue, androidx.compose.ui.geometry.Offset(x, paladasAxisY), androidx.compose.ui.geometry.Offset(x, paladasAxisY - 6f * sy), strokeWidth = 1.2f)
        }
        majorPaladas.forEach { pCount ->
            val x = SessionChartLayout.paladasToX(pCount.toFloat(), points, maxTime, chartLeft, chartWidth)
            drawLine(axisBlue, androidx.compose.ui.geometry.Offset(x, paladasAxisY), androidx.compose.ui.geometry.Offset(x, paladasAxisY - 12f * sy), strokeWidth = 2f)
        }

        // Ejes Y (altura completa del área cartesiana; DPS usa la parte inferior)
        drawLine(axisBlue, Offset(chartLeft, plotTop), Offset(chartLeft, plotBottom), strokeWidth = 2f)
        drawLine(axisBlue, Offset(chartRight, plotTop), Offset(chartRight, plotBottom), strokeWidth = 2f)
        drawLine(gridH, Offset(chartLeft, mainPlotBottom), Offset(chartRight, mainPlotBottom), strokeWidth = 1f)

        // Curvas velocidad / SPM
        val speedPath = Path()
        points.forEachIndexed { i, p ->
            val x = SessionChartLayout.timeToX(p.second.toFloat(), maxTime, chartLeft, chartWidth)
            val y = SessionChartLayout.speedToY(p.speedKmh, maxSpeed, mainPlotBottom, plotTop)
            if (i == 0) speedPath.moveTo(x, y) else speedPath.lineTo(x, y)
        }
        drawPath(speedPath, color = speedColor, style = Stroke(width = 3f))

        val spmPath = Path()
        points.forEachIndexed { i, p ->
            val x = SessionChartLayout.timeToX(p.second.toFloat(), maxTime, chartLeft, chartWidth)
            val y = SessionChartLayout.spmToY(p.spm, maxSpm, mainPlotBottom, plotTop)
            if (i == 0) spmPath.moveTo(x, y) else spmPath.lineTo(x, y)
        }
        drawPath(spmPath, color = spmColor, style = Stroke(width = 3f))

        if (dpsBandBottom > dpsBandTop + 2f && dpsModel.series.size == points.size && dpsModel.maxDpsScale > 0f) {
            val dpsPath = Path()
            points.forEachIndexed { i, p ->
                val x = SessionChartLayout.timeToX(p.second.toFloat(), maxTime, chartLeft, chartWidth)
                val dv = dpsModel.series.getOrElse(i) { 0f }
                val y = SessionChartLayout.dpsToY(dv, dpsModel.maxDpsScale, dpsBandBottom, dpsBandTop)
                if (i == 0) dpsPath.moveTo(x, y) else dpsPath.lineTo(x, y)
            }
            drawPath(dpsPath, color = dpsColor, style = Stroke(width = 2.5f))
        }

        val cirR = 6f * sx.coerceAtLeast(sy)
        val cx = size.width / 2f
        var lxLeg = cx - 128f * sx
        drawCircle(color = speedColor, radius = cirR, center = Offset(lxLeg, legY))
        lxLeg = cx - 8f * sx
        drawCircle(color = spmColor, radius = cirR, center = Offset(lxLeg, legY))
        lxLeg = cx + 112f * sx
        drawCircle(color = dpsColor, radius = cirR, center = Offset(lxLeg, legY))

        val tickPx = 12.sp.toPx()
        val titlePx = 14.sp.toPx()
        val tickPaint = AndroidPaint().apply {
            color = axisBlue.toArgb()
            textSize = tickPx
            isAntiAlias = true
            textAlign = AndroidPaint.Align.CENTER
        }
        val lPaint = AndroidPaint().apply {
            color = axisBlue.toArgb()
            textSize = 13.sp.toPx()
            isAntiAlias = true
            textAlign = AndroidPaint.Align.LEFT
        }
        val rPaint = AndroidPaint().apply {
            color = axisBlue.toArgb()
            textSize = tickPx
            isAntiAlias = true
            textAlign = AndroidPaint.Align.RIGHT
        }
        val bottomTitlePaint = AndroidPaint().apply {
            color = axisBlue.toArgb()
            textSize = titlePx
            isAntiAlias = true
            textAlign = AndroidPaint.Align.CENTER
        }
        val axisLineAndroid = AndroidPaint().apply {
            color = axisBlue.toArgb()
            style = AndroidPaint.Style.STROKE
            isAntiAlias = true
        }
        val paladasAxisTitlePaint = AndroidPaint().apply {
            color = axisBlue.toArgb()
            textSize = 13.sp.toPx()
            isAntiAlias = true
            textAlign = AndroidPaint.Align.CENTER
        }
        val minorPaladasTickPaint = AndroidPaint(tickPaint).apply { textSize = 10.sp.toPx() }
        val yAxisUnitPaint = AndroidPaint().apply {
            color = axisBlue.toArgb()
            textSize = 12.sp.toPx()
            isAntiAlias = true
            textAlign = AndroidPaint.Align.CENTER
        }

        fun formatPaladasTick(p: Float): String =
            if (abs(p - p.roundToInt()) < 0.08f) p.roundToInt().toString()
            else String.format(numberLocale, "%.0f", p)

        drawContext.canvas.nativeCanvas.apply {
            tickPaint.textAlign = AndroidPaint.Align.CENTER
            val majorPalXs = majorPaladas.map { pCount ->
                SessionChartLayout.paladasToX(pCount.toFloat(), points, maxTime, chartLeft, chartWidth)
            }
            majorPaladas.forEachIndexed { i, pCount ->
                drawText(pCount.toString(), majorPalXs[i], paladasAxisY - 14f * sy, tickPaint)
            }
            minorPaladasTickPaint.textAlign = AndroidPaint.Align.CENTER
            minorPaladas.forEach { pF ->
                val x = SessionChartLayout.paladasToX(pF, points, maxTime, chartLeft, chartWidth)
                if (majorPalXs.none { abs(it - x) < 14f * sx }) {
                    drawText(formatPaladasTick(pF), x, paladasAxisY - 12f * sy, minorPaladasTickPaint)
                }
            }
            paladasAxisTitlePaint.textAlign = AndroidPaint.Align.CENTER
            drawText(paladasTitle, (chartLeft + chartRight) / 2f, paladasCaptionY, paladasAxisTitlePaint)

            val cirRL = 6f * sx.coerceAtLeast(sy)
            val cxc = size.width / 2f
            var lx = cxc - 128f * sx
            lPaint.textAlign = AndroidPaint.Align.LEFT
            drawText(legend1, lx + cirRL + 8f * sx, legY + 5f * sy, lPaint)
            lx = cxc - 8f * sx
            drawText(legend2, lx + cirRL + 8f * sx, legY + 5f * sy, lPaint)
            lx = cxc + 112f * sx
            drawText(legend3, lx + cirRL + 8f * sx, legY + 5f * sy, lPaint)

            majorTimes.forEach { tSec ->
                val x = SessionChartLayout.timeToX(tSec, maxTime, chartLeft, chartWidth)
                drawText(tSec.roundToInt().toString(), x, plotBottom + 22f * sy, tickPaint)
            }
            drawText(axisTime, (chartLeft + chartRight) / 2f, size.height - 4f * sy, bottomTitlePaint)

            val off = SessionChartLayout.REF_Y_AXIS_LABEL_OFFSET * sx
            val midY = (plotTop + mainPlotBottom) / 2f
            yAxisUnitPaint.textAlign = AndroidPaint.Align.CENTER
            save()
            translate(chartLeft - off, midY)
            rotate(-90f)
            val fmL = yAxisUnitPaint.fontMetrics
            drawText(yKmh, 0f, -(fmL.ascent + fmL.descent) / 2f, yAxisUnitPaint)
            restore()
            save()
            translate(chartRight + off, midY)
            rotate(-90f)
            val fmR = yAxisUnitPaint.fontMetrics
            drawText(ySpm, 0f, -(fmR.ascent + fmR.descent) / 2f, yAxisUnitPaint)
            restore()

            rPaint.textAlign = AndroidPaint.Align.RIGHT
            speedTicks.forEach { v ->
                val y = SessionChartLayout.speedToY(v, maxSpeed, mainPlotBottom, plotTop)
                val isMax = abs(v - maxSpeed) < 0.01f
                val len = if (isMax || v < 0.01f) 12f * sx else 9f * sx
                axisLineAndroid.strokeWidth = 2f
                drawLine(chartLeft - len, y, chartLeft, y, axisLineAndroid)
                val txt = String.format(numberLocale, "%.1f", v)
                drawText(txt, chartLeft - 16f * sx, y + 5f * sy, rPaint)
            }

            if (dpsBandBottom > dpsBandTop + 2f && dpsModel.maxDpsScale > 0f) {
                val dpsAxisTickPaint = AndroidPaint().apply {
                    color = dpsColor.toArgb()
                    textSize = 10f * sy.coerceAtLeast(sx)
                    isAntiAlias = true
                    textAlign = AndroidPaint.Align.RIGHT
                }
                val dpsTickLen = 8f * sx
                axisLineAndroid.color = axisBlue.toArgb()
                axisLineAndroid.strokeWidth = 1.2f
                drawLine(chartLeft - dpsTickLen, dpsBandBottom, chartLeft, dpsBandBottom, axisLineAndroid)
                drawText("0", chartLeft - 12f * sx, dpsBandBottom + 4f * sy, dpsAxisTickPaint)
                drawLine(chartLeft - dpsTickLen, dpsBandTop, chartLeft, dpsBandTop, axisLineAndroid)
                val dpsMaxLbl = String.format(numberLocale, "%.2f", dpsModel.maxDpsScale)
                drawText(dpsMaxLbl, chartLeft - 12f * sx, dpsBandTop + 4f * sy, dpsAxisTickPaint)
                dpsAxisTickPaint.textSize = 9f * sy.coerceAtLeast(sx)
                dpsAxisTickPaint.textAlign = AndroidPaint.Align.CENTER
                drawText(
                    dpsM,
                    chartLeft - 22f * sx,
                    (dpsBandTop + dpsBandBottom) / 2f,
                    dpsAxisTickPaint
                )
            }

            lPaint.textAlign = AndroidPaint.Align.LEFT
            spmTicks.forEach { s ->
                val y = SessionChartLayout.spmToY(s, maxSpm, mainPlotBottom, plotTop)
                val isMajor = s == 0 || s == maxSpm || s == spmHalf
                val len = if (isMajor) 12f * sx else 7f * sx
                axisLineAndroid.strokeWidth = if (isMajor) 2f else 1.2f
                drawLine(chartRight, y, chartRight + len, y, axisLineAndroid)
                drawText(s.toString(), chartRight + 16f * sx, y + 5f * sy, lPaint)
            }

            val dpsStatPaint = AndroidPaint().apply {
                color = dpsColor.toArgb()
                textSize = 10f * sy.coerceAtLeast(sx)
                isAntiAlias = true
                textAlign = AndroidPaint.Align.LEFT
            }
            if (dpsBandBottom > dpsBandTop + 2f) {
                val statLine = if (dpsModel.strokeCount > 0) {
                    val mx = String.format(numberLocale, "%.2f", dpsModel.maxSample)
                    val mn = String.format(numberLocale, "%.2f", dpsModel.minSample)
                    val md = String.format(numberLocale, "%.2f", dpsModel.modeDps)
                    String.format(
                        dpsLineFmt,
                        mx,
                        mn,
                        md,
                        dpsModel.modeCount
                    )
                } else {
                    dpsNoIncr
                }
                drawText(statLine, chartLeft + 6f * sx, dpsBandBottom - 4f * sy, dpsStatPaint)
            }
        }
    }
}
