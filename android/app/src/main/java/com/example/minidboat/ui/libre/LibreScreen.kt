package com.example.minidboat.ui.libre

import android.Manifest
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlayCircleFilled
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import kotlinx.coroutines.delay
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.SkyLight
import com.example.minidboat.ui.theme.SkyPale
import com.example.minidboat.ui.theme.WaveWhite
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.R
import com.example.minidboat.ui.components.CountdownOverlay
import com.example.minidboat.ui.components.TrainingDataCards
import com.example.minidboat.viewmodel.CompetenciaSubmitOutcome
import com.example.minidboat.viewmodel.LibreViewModel
import androidx.compose.runtime.collectAsState
import androidx.lifecycle.viewmodel.compose.viewModel

private fun viewModelKey(mode: TrainingScreenMode): String = when (mode) {
    is TrainingScreenMode.Libre -> "training_libre"
    is TrainingScreenMode.Competencia -> "training_competencia"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibreScreen(
    onBack: () -> Unit,
    mode: TrainingScreenMode = TrainingScreenMode.Libre,
) {
    val vmKey = viewModelKey(mode)
    val viewModel: LibreViewModel = viewModel(key = vmKey)
    fun handleBack() {
        viewModel.reset()
        onBack()
    }
    BackHandler(onBack = { handleBack() })
    val context = LocalContext.current
    val state by viewModel.state.collectAsState()
    var countdownRemaining by remember { mutableStateOf<Int?>(null) }
    var countdownSession by remember { mutableIntStateOf(0) }
    var triggerStartAfterPermission by remember { mutableStateOf(false) }
    var competenciaCountdownKickoff by remember { mutableIntStateOf(0) }
    var competenciaSubmitting by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
            when (mode) {
                is TrainingScreenMode.Libre -> triggerStartAfterPermission = true
                is TrainingScreenMode.Competencia -> competenciaCountdownKickoff++
            }
        }
    }

    fun doStartExerciseLibre() {
        val countdown = AppPreferences.getCountdownSeconds(context)
        if (countdown > 0) {
            countdownSession++
            countdownRemaining = countdown
        } else {
            viewModel.start(context)
        }
    }

    LaunchedEffect(Unit) {
        if (mode is TrainingScreenMode.Competencia) {
            viewModel.configureForCompetencia(context)
            if (viewModel.hasLocationPermission(context)) {
                competenciaCountdownKickoff++
            } else {
                permissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                    )
                )
            }
        }
    }

    LaunchedEffect(competenciaCountdownKickoff) {
        if (competenciaCountdownKickoff < 1 || mode !is TrainingScreenMode.Competencia) return@LaunchedEffect
        for (n in 5 downTo 0) {
            countdownRemaining = n
            delay(50)
            delay(950L)
        }
        countdownRemaining = null
        viewModel.start(context)
    }

    LaunchedEffect(countdownSession) {
        if (mode is TrainingScreenMode.Competencia) return@LaunchedEffect
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
        if (mode is TrainingScreenMode.Competencia) return@LaunchedEffect
        if (triggerStartAfterPermission) {
            triggerStartAfterPermission = false
            doStartExerciseLibre()
        }
    }

    val gradientBackground = remember {
        Brush.verticalGradient(
            colors = listOf(WaveWhite, SkyPale.copy(alpha = 0.6f))
        )
    }

    val titleText = when (mode) {
        is TrainingScreenMode.Libre -> stringResource(R.string.libre_top_title)
        is TrainingScreenMode.Competencia -> stringResource(R.string.compet_top_title)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = titleText,
                        fontWeight = FontWeight.Bold,
                        color = OceanDeep
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { handleBack() }) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = stringResource(R.string.ej_back_to_main),
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
                CountdownOverlay(secondsRemaining = countdownRemaining!!)
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    TrainingDataCards(
                        modifier = Modifier.weight(1f),
                        state = state
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    when (mode) {
                        is TrainingScreenMode.Libre -> {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                ControlButton(
                                    modifier = Modifier.weight(1f),
                                    isStarted = state.isStarted,
                                    isPaused = state.isPaused,
                                    startLabel = stringResource(R.string.ej_start),
                                    resumeLabel = stringResource(R.string.ej_resume),
                                    pauseLabel = stringResource(R.string.ej_pause),
                                    onComenzar = {
                                        if (viewModel.hasLocationPermission(context)) {
                                            doStartExerciseLibre()
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
                                Button(
                                    onClick = {
                                        val totalSeconds = state.elapsedSeconds
                                        val totalDistanceM = state.distanceMeters
                                        val totalPaladas = state.paladas
                                        val maxSpeedKmh = state.sessionMaxSpeedMps * 3.6f
                                        val avgSpeedKmh = if (totalSeconds > 0) {
                                            (totalDistanceM / 1000f) / (totalSeconds / 3600f)
                                        } else 0f
                                        val chartData = viewModel.getSessionDataForChart()
                                        val file = com.example.minidboat.util.createSummaryImage(
                                            context, totalSeconds, totalDistanceM, totalPaladas,
                                            maxSpeedKmh, avgSpeedKmh,
                                            title = context.getString(R.string.libre_share_image_title),
                                            subtitle = AppPreferences.getLibreShareImageSecondLine(context),
                                            chartDataPoints = chartData,
                                            trainingStartIso = viewModel.getSessionStartIsoForShare().takeIf { it.isNotBlank() }
                                        )
                                        file?.let { com.example.minidboat.util.shareSummaryImage(context, it) }
                                    },
                                    modifier = Modifier.weight(1f),
                                    enabled = state.isStarted && state.isPaused,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = OceanDeep,
                                        contentColor = Color.White,
                                        disabledContainerColor = Color(0xFFB0BEC5),
                                        disabledContentColor = Color.White.copy(alpha = 0.7f)
                                    )
                                ) {
                                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(stringResource(R.string.action_share))
                                }
                            }
                        }
                        is TrainingScreenMode.Competencia -> {
                            Button(
                                onClick = {
                                    if (competenciaSubmitting) return@Button
                                    competenciaSubmitting = true
                                    viewModel.submitCompetenciaSession(context) { outcome ->
                                        competenciaSubmitting = false
                                        val msg = when (outcome) {
                                            is CompetenciaSubmitOutcome.Uploaded ->
                                                context.getString(R.string.compet_toast_uploaded)
                                            is CompetenciaSubmitOutcome.SavedPendingUpload ->
                                                context.getString(
                                                    R.string.compet_toast_pending,
                                                    outcome.detail,
                                                )
                                            is CompetenciaSubmitOutcome.Error ->
                                                outcome.message
                                        }
                                        Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                                        if (outcome !is CompetenciaSubmitOutcome.Error) {
                                            mode.onSubmittedNavigateHome()
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = state.competenciaAwaitingSubmit && !competenciaSubmitting,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = OceanDeep,
                                    contentColor = Color.White,
                                    disabledContainerColor = Color(0xFFB0BEC5),
                                    disabledContentColor = Color.White.copy(alpha = 0.75f),
                                ),
                            ) {
                                Text(
                                    if (competenciaSubmitting) {
                                        stringResource(R.string.compet_btn_sending)
                                    } else {
                                        stringResource(R.string.compet_btn_done)
                                    },
                                    color = if (state.competenciaAwaitingSubmit && !competenciaSubmitting) Color.White else Color.White.copy(alpha = 0.7f)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ControlButton(
    modifier: Modifier = Modifier,
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
        modifier = modifier,
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
