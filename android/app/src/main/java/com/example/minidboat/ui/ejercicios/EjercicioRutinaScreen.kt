package com.example.minidboat.ui.ejercicios

import android.Manifest
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlayCircleFilled
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import kotlinx.coroutines.delay
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.minidboat.R
import com.example.minidboat.ui.components.TrainingDataCards
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.data.ExerciseValueType
import com.example.minidboat.data.Routine
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.SkyLight
import com.example.minidboat.ui.theme.SkyPale
import com.example.minidboat.ui.theme.WaveWhite
import com.example.minidboat.util.formatTimeHhMmSs
import com.example.minidboat.util.formatWithThousands
import com.example.minidboat.util.formatWithThousandsTwoDecimals
import com.example.minidboat.viewmodel.LibreViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EjercicioRutinaScreen(
    routine: Routine,
    onBack: () -> Unit,
    viewModel: LibreViewModel = viewModel()
) {
    fun handleBack() {
        viewModel.reset()
        onBack()
    }
    val context = LocalContext.current
    val state by viewModel.state.collectAsState()
    var currentExerciseIndex by remember { mutableIntStateOf(0) }
    var isFinished by remember { mutableStateOf(false) }
    val sortedExercises = remember(routine) { routine.exercises.sortedBy { it.order } }
    val exercisesListState = rememberLazyListState()

    LaunchedEffect(currentExerciseIndex) {
        if (currentExerciseIndex < sortedExercises.size && sortedExercises.isNotEmpty()) {
            exercisesListState.animateScrollToItem(currentExerciseIndex)
        }
    }

    LaunchedEffect(
        state.elapsedSeconds,
        state.distanceMeters,
        state.paladas,
        state.isStarted,
        state.isPaused,
        currentExerciseIndex,
        sortedExercises
    ) {
        if (!state.isStarted || state.isPaused) return@LaunchedEffect
        if (currentExerciseIndex >= sortedExercises.size) return@LaunchedEffect

        val current = sortedExercises[currentExerciseIndex]
        val targetReached = when (current.valueType) {
            ExerciseValueType.TIME -> state.elapsedSeconds >= current.value.toLong()
            ExerciseValueType.DISTANCE -> state.distanceMeters >= current.value.toFloat()
            ExerciseValueType.PALADAS -> state.paladas >= current.value
        }
        if (targetReached) {
            viewModel.addToSessionTotals(
                seconds = state.elapsedSeconds,
                distanceM = state.distanceMeters,
                paladas = state.paladas
            )
            viewModel.resetForNextExercise()
            if (currentExerciseIndex < sortedExercises.size - 1) {
                currentExerciseIndex++
            } else {
                currentExerciseIndex = sortedExercises.size
                viewModel.finalizeSession()
                viewModel.pause()
                isFinished = true
            }
        }
    }

    var countdownRemaining by remember { mutableStateOf<Int?>(null) }
    var countdownSession by remember { mutableIntStateOf(0) }
    var triggerStartAfterPermission by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
            triggerStartAfterPermission = true
        }
    }

    fun doStartExercise() {
        val countdown = AppPreferences.getCountdownSeconds(context)
        if (countdown > 0) {
            countdownSession++
            countdownRemaining = countdown
        } else {
            viewModel.start(context)
        }
    }

    LaunchedEffect(countdownSession) {
        val total = countdownRemaining ?: return@LaunchedEffect
        for (n in total downTo 0) {
            countdownRemaining = n
            delay(50)
            delay(950L)
        }
        countdownRemaining = null
        viewModel.start(context)
    }

    LaunchedEffect(triggerStartAfterPermission) {
        if (triggerStartAfterPermission) {
            triggerStartAfterPermission = false
            doStartExercise()
        }
    }

    val gradientBackground = remember {
        Brush.verticalGradient(
            colors = listOf(WaveWhite, SkyPale.copy(alpha = 0.6f))
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = routine.name,
                        fontWeight = FontWeight.Bold,
                        color = OceanDeep
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { handleBack() }) {
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(gradientBackground)
                .padding(padding)
        ) {
            if (countdownRemaining != null) {
                com.example.minidboat.ui.components.CountdownOverlay(secondsRemaining = countdownRemaining!!)
            } else if (isFinished) {
                SummaryOverlay(
                    context = context,
                    totalSeconds = state.sessionTotalSeconds,
                    totalDistanceM = state.sessionTotalDistanceM,
                    totalPaladas = state.sessionTotalPaladas,
                    maxSpeedKmh = state.sessionMaxSpeedMps * 3.6f,
                    avgSpeedKmh = if (state.sessionTotalElapsedSeconds > 0)
                        (state.sessionTotalDistanceM / 1000f) / (state.sessionTotalElapsedSeconds / 3600f) else 0f,
                    routineName = routine.name,
                    chartDataPoints = viewModel.getSessionDataForChart(),
                    onClose = { handleBack() }
                )
            } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                ExercisesCard(
                    modifier = Modifier.weight(0.35f),
                    routine = routine,
                    currentExerciseIndex = currentExerciseIndex,
                    listState = exercisesListState
                )
                Spacer(modifier = Modifier.height(10.dp))
                TrainingDataCards(
                    modifier = Modifier.weight(1f),
                    state = state
                )
                Spacer(modifier = Modifier.height(16.dp))
                EjercicioControlButton(
                    isStarted = state.isStarted,
                    isPaused = state.isPaused,
                    startLabel = stringResource(R.string.ej_start),
                    resumeLabel = stringResource(R.string.ej_resume),
                    pauseLabel = stringResource(R.string.ej_pause),
                    onComenzar = {
                        currentExerciseIndex = 0
                        isFinished = false
                        viewModel.resetSessionTotals()
                        viewModel.resetForNextExercise()
                        if (viewModel.hasLocationPermission(context)) {
                            doStartExercise()
                        } else {
                            permissionLauncher.launch(
                                arrayOf(
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                )
                            )
                        }
                    },
                    onPausar = { viewModel.pause() },
                    onReanudar = {
                        if (viewModel.hasLocationPermission(context)) {
                            viewModel.resume(context)
                        } else {
                            permissionLauncher.launch(
                                arrayOf(
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                )
                            )
                        }
                    }
                )
            }
            }
        }
    }
}

@Composable
private fun SummaryOverlay(
    context: Context,
    totalSeconds: Long,
    totalDistanceM: Float,
    totalPaladas: Int,
    maxSpeedKmh: Float,
    avgSpeedKmh: Float,
    routineName: String,
    chartDataPoints: List<com.example.minidboat.viewmodel.LibreSessionDataPoint>? = null,
    onClose: () -> Unit,
) {
    val doneText = stringResource(R.string.ej_routine_done)
    Surface(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        shape = RoundedCornerShape(16.dp),
        color = SkyLight.copy(alpha = 0.95f)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                Icons.Default.Check,
                contentDescription = null,
                tint = OceanDeep,
                modifier = Modifier.size(56.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = doneText,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = OceanDeep
            )
            Text(
                text = routineName,
                style = MaterialTheme.typography.titleMedium,
                color = OceanDeep
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = stringResource(R.string.ej_summary),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = OceanDeep
            )
            Spacer(modifier = Modifier.height(12.dp))
            SummaryRow(
                stringResource(R.string.ej_total_time),
                stringResource(R.string.ej_value_seconds, formatWithThousands(totalSeconds)),
            )
            SummaryRow(
                stringResource(R.string.ej_time_hhmmss),
                formatTimeHhMmSs(totalSeconds),
            )
            SummaryRow(
                stringResource(R.string.ej_total_distance),
                stringResource(
                    R.string.ej_value_meters,
                    formatWithThousands(totalDistanceM.toLong()),
                ),
            )
            SummaryRow(
                stringResource(R.string.ej_total_strokes),
                formatWithThousands(totalPaladas),
            )
            SummaryRow(
                stringResource(R.string.ej_max_speed),
                stringResource(
                    R.string.ej_value_kmh,
                    formatWithThousandsTwoDecimals(maxSpeedKmh),
                ),
            )
            SummaryRow(
                stringResource(R.string.ej_avg_speed),
                stringResource(
                    R.string.ej_value_kmh,
                    formatWithThousandsTwoDecimals(avgSpeedKmh),
                ),
            )
            Spacer(modifier = Modifier.height(32.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = {
                        val file = com.example.minidboat.util.createSummaryImage(
                            context, totalSeconds, totalDistanceM, totalPaladas,
                            maxSpeedKmh, avgSpeedKmh,
                            context.getString(R.string.ej_routine_done),
                            routineName,
                            chartDataPoints = chartDataPoints
                        )
                        file?.let { com.example.minidboat.util.shareSummaryImage(context, it) }
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = OceanDeep,
                        contentColor = Color.White
                    )
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.size(8.dp))
                    Text(stringResource(R.string.action_share), color = Color.White)
                }
                Button(
                    onClick = onClose,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF616161),
                        contentColor = Color.White
                    )
                ) {
                    Text(stringResource(R.string.action_close), color = Color.White)
                }
            }
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, color = OceanDeep)
        Text(text = value, fontWeight = FontWeight.Medium, color = Color(0xFF1A237E))
    }
}

@Composable
private fun ExercisesCard(
    modifier: Modifier = Modifier,
    routine: Routine,
    currentExerciseIndex: Int,
    listState: LazyListState
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = SkyLight.copy(alpha = 0.5f)
    ) {
        val sortedExercises = routine.exercises.sortedBy { it.order }
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            items(sortedExercises.size) { index ->
                val ex = sortedExercises[index]
                val isCurrent = index == currentExerciseIndex
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${index + 1}. ${ex.type.displayName}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontSize = if (isCurrent) 18.sp else 14.sp,
                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium,
                        color = OceanDeep
                    )
                    Text(
                        text = "${ex.value} ${ex.unitLabel}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontSize = if (isCurrent) 18.sp else 14.sp,
                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
                        color = OceanDeep
                    )
                }
            }
        }
    }
}

@Composable
private fun EjercicioControlButton(
    isStarted: Boolean,
    isPaused: Boolean,
    startLabel: String,
    resumeLabel: String,
    pauseLabel: String,
    onComenzar: () -> Unit,
    onPausar: () -> Unit,
    onReanudar: () -> Unit
) {
    val (text, icon, onClick) = when {
        !isStarted -> Triple(startLabel, Icons.Default.PlayCircleFilled, onComenzar)
        isPaused -> Triple(resumeLabel, Icons.Default.PlayArrow, onReanudar)
        else -> Triple(pauseLabel, Icons.Default.Pause, onPausar)
    }
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(0.7f),
        colors = ButtonDefaults.buttonColors(
            containerColor = OceanDeep,
            contentColor = Color.White
        )
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.padding(end = 8.dp)
        )
        Text(text, color = Color.White)
    }
}
