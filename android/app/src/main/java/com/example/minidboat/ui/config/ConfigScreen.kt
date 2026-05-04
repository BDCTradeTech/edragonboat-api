package com.example.minidboat.ui.config

import android.content.Context
import android.widget.Toast
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.example.minidboat.R
import androidx.appcompat.app.AppCompatDelegate
import com.example.minidboat.MiniDBoatApplication
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.data.UI_LANGUAGE_OPTIONS
import com.example.minidboat.data.uiLanguageCodeToLocaleListCompat
import com.example.minidboat.ui.components.DropdownSelectRow
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.SkyLight
import com.example.minidboat.ui.theme.SkyPale
import com.example.minidboat.ui.theme.WaveWhite
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

@Composable
private fun uiLanguageLabel(code: String) = stringResource(
    when (code) {
        "de" -> R.string.lang_de
        "en" -> R.string.lang_en
        "es" -> R.string.lang_es
        "fil" -> R.string.lang_fil
        "fr" -> R.string.lang_fr
        "ja" -> R.string.lang_ja
        "ms" -> R.string.lang_ms
        "pt" -> R.string.lang_pt
        "zh" -> R.string.lang_zh
        else -> R.string.lang_es
    }
)

private fun refreshPendingCompetenciasCount(context: Context): Int {
    AppPreferences.backfillPendingCompetenciaFiles(context)
    AppPreferences.claimNoSessionPendingFilesForLoggedInUser(context)
    return AppPreferences.pendingCompetenciaCount(context)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfigScreen(
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val app = context.applicationContext as MiniDBoatApplication
    var pendingCompetencias by remember { mutableIntStateOf(refreshPendingCompetenciasCount(context)) }
    val sessionEmail = AppPreferences.getCloudEmail(context) ?: ""
    val guestMode = AppPreferences.isGuestMode(context)
    LaunchedEffect(Unit) {
        pendingCompetencias = refreshPendingCompetenciasCount(context)
    }
    LaunchedEffect(sessionEmail, guestMode) {
        pendingCompetencias = refreshPendingCompetenciasCount(context)
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val obs = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                pendingCompetencias = refreshPendingCompetenciasCount(context)
            }
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }
    var boatType by remember { mutableStateOf(AppPreferences.getBoatType(context)) }
    var boatExpanded by remember { mutableStateOf(false) }
    var paddlersCount by remember { mutableIntStateOf(AppPreferences.getPaddlersCount(context)) }
    var paddlersExpanded by remember { mutableStateOf(false) }
    var countdownSeconds by remember { mutableIntStateOf(AppPreferences.getCountdownSeconds(context)) }
    var countdownExpanded by remember { mutableStateOf(false) }
    var strokeMinIntervalMs by remember { mutableIntStateOf(AppPreferences.getStrokeMinIntervalMs(context)) }
    var strokeExpanded by remember { mutableStateOf(false) }
    var spmIntervals by remember { mutableIntStateOf(AppPreferences.getSpmIntervals(context)) }
    var spmExpanded by remember { mutableStateOf(false) }
    var speedSmoothSamples by remember { mutableIntStateOf(AppPreferences.getSpeedSmoothSamples(context)) }
    var speedExpanded by remember { mutableStateOf(false) }
    var dpsStrokeWindow by remember { mutableIntStateOf(AppPreferences.getDpsStrokeWindow(context)) }
    var dpsExpanded by remember { mutableStateOf(false) }
    var strokeAxisLandscape by remember { mutableStateOf(AppPreferences.getStrokeAccelAxisIsLandscape(context)) }
    var strokeAxisExpanded by remember { mutableStateOf(false) }
    var strokeSensTenths by remember { mutableIntStateOf(AppPreferences.getStrokeSensitivityTenths(context)) }
    var strokeSensExpanded by remember { mutableStateOf(false) }
    var uiLanguage by remember { mutableStateOf(AppPreferences.getUiLanguage(context)) }
    var languageExpanded by remember { mutableStateOf(false) }

    val gradientBackground = Brush.verticalGradient(
        colors = listOf(WaveWhite, SkyPale.copy(alpha = 0.6f))
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.config_title),
                        style = MaterialTheme.typography.titleLarge.copy(fontSize = 17.sp),
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(gradientBackground)
                .padding(padding)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 10.dp, vertical = 2.dp)
            ) {
                ConfigLabeled(stringResource(R.string.config_language)) {
                    DropdownSelectRow(
                        label = uiLanguageLabel(uiLanguage),
                        expanded = languageExpanded,
                        onOpen = { languageExpanded = true },
                        onDismiss = { languageExpanded = false },
                        compact = true,
                    ) {
                        UI_LANGUAGE_OPTIONS.forEach { opt ->
                            DropdownMenuItem(
                                text = { Text(uiLanguageLabel(opt.code), color = Color.Black) },
                                onClick = {
                                    uiLanguage = opt.code
                                    AppPreferences.setUiLanguage(context, opt.code)
                                    AppCompatDelegate.setApplicationLocales(
                                        uiLanguageCodeToLocaleListCompat(opt.code)
                                    )
                                    languageExpanded = false
                                }
                            )
                        }
                    }
                }
                Spacer(Modifier.height(3.dp))
                if (pendingCompetencias > 0) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 1.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            stringResource(R.string.config_pending, pendingCompetencias),
                            fontSize = 11.sp,
                            color = OceanDeep,
                        )
                        TextButton(
                            onClick = {
                                if (!AppPreferences.isCloudLoggedIn(context)) {
                                    Toast.makeText(
                                        context,
                                        context.getString(R.string.toast_login_upload),
                                        Toast.LENGTH_LONG,
                                    ).show()
                                    return@TextButton
                                }
                                scope.launch {
                                    val (ok, fail) = withContext(Dispatchers.IO) {
                                        app.cloudRepository.retryPendingCompetenciaUploads()
                                    }
                                    pendingCompetencias = refreshPendingCompetenciasCount(context)
                                    val msg = when {
                                        ok > 0 && fail == 0 -> context.getString(R.string.toast_sent_ok, ok)
                                        ok > 0 -> context.getString(R.string.toast_sent_mix, ok, fail)
                                        else -> context.getString(R.string.toast_sent_fail, fail)
                                    }
                                    Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                                }
                            }
                        ) { Text(stringResource(R.string.config_send), fontSize = 12.sp) }
                    }
                    Spacer(Modifier.height(3.dp))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Column(Modifier.weight(1f)) {
                        ConfigLabeled(stringResource(R.string.config_boat)) {
                            BoatDropdown(
                                boatType = boatType,
                                boatExpanded = boatExpanded,
                                onOpen = { boatExpanded = true },
                                onDismiss = { boatExpanded = false },
                                onSelect = { t ->
                                    boatType = t
                                    AppPreferences.setBoatType(context, t)
                                    boatExpanded = false
                                }
                            )
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        ConfigLabeled(stringResource(R.string.config_paddlers)) {
                            DropdownSelectRow(
                                label = "$paddlersCount",
                                expanded = paddlersExpanded,
                                onOpen = { paddlersExpanded = true },
                                onDismiss = { paddlersExpanded = false },
                                compact = true,
                            ) {
                                AppPreferences.paddlersCountOptions.forEach { n ->
                                    DropdownMenuItem(
                                        text = { Text("$n", color = Color.Black) },
                                        onClick = {
                                            paddlersCount = n
                                            AppPreferences.setPaddlersCount(context, n)
                                            paddlersExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(2.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Column(Modifier.weight(1f)) {
                        ConfigLabeled(stringResource(R.string.config_countdown)) {
                            val cdLabel = if (countdownSeconds == 0) {
                                stringResource(R.string.countdown_zero)
                            } else {
                                stringResource(R.string.countdown_s, countdownSeconds)
                            }
                            DropdownSelectRow(
                                label = cdLabel,
                                expanded = countdownExpanded,
                                onOpen = { countdownExpanded = true },
                                onDismiss = { countdownExpanded = false },
                                compact = true,
                            ) {
                                AppPreferences.countdownOptions.forEach { seconds ->
                                    val line = if (seconds == 0) {
                                        stringResource(R.string.countdown_zero)
                                    } else {
                                        stringResource(R.string.countdown_s, seconds)
                                    }
                                    DropdownMenuItem(
                                        text = { Text(line, color = Color.Black) },
                                        onClick = {
                                            countdownSeconds = seconds
                                            AppPreferences.setCountdownSeconds(context, seconds)
                                            countdownExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        ConfigLabeled(stringResource(R.string.config_spm)) {
                            DropdownSelectRow(
                                label = "$spmIntervals",
                                expanded = spmExpanded,
                                onOpen = { spmExpanded = true },
                                onDismiss = { spmExpanded = false },
                                compact = true,
                            ) {
                                AppPreferences.spmIntervalsOptions.forEach { n ->
                                    DropdownMenuItem(
                                        text = { Text("$n", color = Color.Black) },
                                        onClick = {
                                            spmIntervals = n
                                            AppPreferences.setSpmIntervals(context, n)
                                            spmExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(2.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Column(Modifier.weight(1f)) {
                        ConfigLabeled(stringResource(R.string.config_speed)) {
                            val spdLabel = if (speedSmoothSamples == 1) {
                                stringResource(R.string.config_speed_1)
                            } else {
                                stringResource(R.string.speed_n, speedSmoothSamples)
                            }
                            DropdownSelectRow(
                                label = spdLabel,
                                expanded = speedExpanded,
                                onOpen = { speedExpanded = true },
                                onDismiss = { speedExpanded = false },
                                compact = true,
                            ) {
                                AppPreferences.speedSmoothSamplesOptions.forEach { n ->
                                    val line = if (n == 1) {
                                        stringResource(R.string.config_speed_1)
                                    } else {
                                        stringResource(R.string.speed_n, n)
                                    }
                                    DropdownMenuItem(
                                        text = { Text(line, color = Color.Black) },
                                        onClick = {
                                            speedSmoothSamples = n
                                            AppPreferences.setSpeedSmoothSamples(context, n)
                                            speedExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        ConfigLabeled(stringResource(R.string.config_dps)) {
                            DropdownSelectRow(
                                label = stringResource(R.string.dps_n_pal, dpsStrokeWindow),
                                expanded = dpsExpanded,
                                onOpen = { dpsExpanded = true },
                                onDismiss = { dpsExpanded = false },
                                compact = true,
                            ) {
                                AppPreferences.dpsStrokeWindowOptions.forEach { n ->
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.dps_menu_pal, n), color = Color.Black) },
                                        onClick = {
                                            dpsStrokeWindow = n
                                            AppPreferences.setDpsStrokeWindow(context, n)
                                            dpsExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(2.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Column(Modifier.weight(1f)) {
                        ConfigLabeled(stringResource(R.string.config_axis)) {
                            val axisLabel = if (strokeAxisLandscape) {
                                stringResource(R.string.config_axis_y)
                            } else {
                                stringResource(R.string.config_axis_x)
                            }
                            DropdownSelectRow(
                                label = axisLabel,
                                expanded = strokeAxisExpanded,
                                onOpen = { strokeAxisExpanded = true },
                                onDismiss = { strokeAxisExpanded = false },
                                compact = true,
                            ) {
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.config_axis_y), color = Color.Black) },
                                    onClick = {
                                        strokeAxisLandscape = true
                                        AppPreferences.setStrokeAccelAxisLandscape(context, true)
                                        strokeAxisExpanded = false
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.config_axis_x), color = Color.Black) },
                                    onClick = {
                                        strokeAxisLandscape = false
                                        AppPreferences.setStrokeAccelAxisLandscape(context, false)
                                        strokeAxisExpanded = false
                                    }
                                )
                            }
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        ConfigLabeled(stringResource(R.string.config_sens)) {
                            val tLabel = String.format(Locale.getDefault(), "%.1f", strokeSensTenths / 10f)
                            val sLabel = if (strokeSensTenths == AppPreferences.DEFAULT_STROKE_SENSITIVITY_TENTHS) {
                                stringResource(R.string.sens_t_def, tLabel)
                            } else {
                                stringResource(R.string.sens_t, tLabel)
                            }
                            DropdownSelectRow(
                                label = sLabel,
                                expanded = strokeSensExpanded,
                                onOpen = { strokeSensExpanded = true },
                                onDismiss = { strokeSensExpanded = false },
                                compact = true,
                            ) {
                                (0..10).forEach { tenths ->
                                    val tStr = String.format(Locale.getDefault(), "%.1f", tenths / 10f)
                                    val mText = if (tenths == AppPreferences.DEFAULT_STROKE_SENSITIVITY_TENTHS) {
                                        stringResource(R.string.sens_t_def, tStr)
                                    } else {
                                        stringResource(R.string.sens_t, tStr)
                                    }
                                    DropdownMenuItem(
                                        text = { Text(mText, color = Color.Black) },
                                        onClick = {
                                            strokeSensTenths = tenths
                                            AppPreferences.setStrokeSensitivityTenths(context, tenths)
                                            strokeSensExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(2.dp))
                ConfigLabeled(stringResource(R.string.config_minpal)) {
                    val mLabel = if (strokeMinIntervalMs == AppPreferences.DEFAULT_STROKE_MIN_INTERVAL_MS) {
                        stringResource(R.string.int_ms_def, strokeMinIntervalMs)
                    } else {
                        stringResource(R.string.int_ms, strokeMinIntervalMs)
                    }
                    DropdownSelectRow(
                        label = mLabel,
                        expanded = strokeExpanded,
                        onOpen = { strokeExpanded = true },
                        onDismiss = { strokeExpanded = false },
                        compact = true,
                    ) {
                        AppPreferences.strokeMinIntervalMsOptions.forEach { ms ->
                            val itemText = if (ms == AppPreferences.DEFAULT_STROKE_MIN_INTERVAL_MS) {
                                stringResource(R.string.int_ms_def, ms)
                            } else {
                                stringResource(R.string.int_ms, ms)
                            }
                            DropdownMenuItem(
                                text = { Text(itemText, color = Color.Black) },
                                onClick = {
                                    strokeMinIntervalMs = ms
                                    AppPreferences.setStrokeMinIntervalMs(context, ms)
                                    strokeExpanded = false
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ConfigLabeled(
    label: String,
    content: @Composable () -> Unit,
) {
    Column {
        Text(
            text = label,
            fontSize = 10.sp,
            lineHeight = 11.sp,
            maxLines = 1,
            fontWeight = FontWeight.SemiBold,
            color = OceanDeep,
        )
        Spacer(Modifier.height(1.dp))
        content()
    }
}

@Composable
private fun BoatDropdown(
    boatType: String,
    boatExpanded: Boolean,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
) {
    val label = when (boatType) {
        AppPreferences.BOAT_TYPE_GRANDE -> stringResource(R.string.boat_grande)
        AppPreferences.BOAT_TYPE_CHICO -> stringResource(R.string.boat_chico)
        else -> stringResource(R.string.boat_grande)
    }
    DropdownSelectRow(
        label = label,
        expanded = boatExpanded,
        onOpen = onOpen,
        onDismiss = onDismiss,
        compact = true,
    ) {
        AppPreferences.boatTypeOptions.forEach { type ->
            val name = when (type) {
                AppPreferences.BOAT_TYPE_GRANDE -> stringResource(R.string.boat_grande)
                AppPreferences.BOAT_TYPE_CHICO -> stringResource(R.string.boat_chico)
                else -> stringResource(R.string.boat_grande)
            }
            DropdownMenuItem(
                text = { Text(name, color = Color.Black) },
                onClick = { onSelect(type) }
            )
        }
    }
}
