package com.example.minidboat

import android.os.Bundle
import android.widget.Toast
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.DirectionsBoat
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.compose.rememberNavController
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.navigation.AppNavHost
import com.example.minidboat.ui.theme.MiniDBoatTheme
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.SkyBlue
import com.example.minidboat.ui.theme.SkyLight
import com.example.minidboat.ui.theme.SkyPale
import com.example.minidboat.ui.theme.WaveWhite
import com.example.minidboat.R
import com.example.minidboat.ui.components.GpsStatusDot
import com.example.minidboat.viewmodel.RoutinesViewModel
import androidx.compose.ui.res.stringResource


class MainActivity : AppCompatActivity() {
    private val routinesViewModel: RoutinesViewModel by lazy {
        ViewModelProvider(this, object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val app = application as MiniDBoatApplication
                return RoutinesViewModel(app.routineRepository, app.cloudRepository) as T
            }
        })[RoutinesViewModel::class.java]
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) {
            AppPreferences.resetSessionForAppLaunch(applicationContext)
        }
        enableEdgeToEdge()
        hideSystemBars()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val activity = this
        setContent {
            MiniDBoatTheme {
                val context = LocalContext.current
                val importToast by routinesViewModel.importToast.collectAsState()
                val navController = rememberNavController()

                LaunchedEffect(importToast) {
                    val msg = importToast ?: return@LaunchedEffect
                    Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                    routinesViewModel.consumeImportToast()
                }

                AppNavHost(
                    navController = navController,
                    routinesViewModel = routinesViewModel,
                    onFinish = { activity.finish() },
                )
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}

@Composable
fun MainScreen(
    onEjerciciosClick: () -> Unit,
    onLibreClick: () -> Unit,
    onGraficosClick: () -> Unit,
    onCompetenciasClick: () -> Unit,
    onConfigClick: () -> Unit,
    onSalirClick: () -> Unit,
    onChangeAccount: () -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MiniDBoatApplication
    var teamLabel by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(
        AppPreferences.isCloudLoggedIn(context),
        AppPreferences.isGuestMode(context),
    ) {
        when {
            AppPreferences.isGuestMode(context) ->
                teamLabel = AppPreferences.LABEL_NO_TEAM
            AppPreferences.isCloudLoggedIn(context) -> {
                teamLabel = null
                teamLabel = app.cloudRepository.refreshCachedTeamFromApi()
            }
            else -> teamLabel = AppPreferences.LABEL_NO_TEAM
        }
    }
    val teamLine = teamLabel ?: "…"
    val userSubtitle = when {
        AppPreferences.isCloudLoggedIn(context) ->
            AppPreferences.getCloudEmail(context)?.takeIf { it.isNotBlank() }
                ?: stringResource(R.string.main_user)
        AppPreferences.isGuestMode(context) -> stringResource(R.string.main_guest)
        else -> ""
    }
    val gradientBackground = Brush.verticalGradient(
        colors = listOf(
            WaveWhite,
            SkyPale.copy(alpha = 0.6f)
        )
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(gradientBackground)
    ) {
        Row(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            GpsStatusDot()
            IconButton(onClick = onConfigClick) {
                Icon(
                    imageVector = Icons.Default.Settings,
                    contentDescription = stringResource(R.string.main_open_config),
                    tint = OceanDeep,
                )
            }
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = stringResource(R.string.main_title),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = OceanDeep,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            if (userSubtitle.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = userSubtitle,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = OceanDeep.copy(alpha = 0.92f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = stringResource(R.string.main_team, teamLine),
                    style = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp),
                    color = OceanDeep.copy(alpha = 0.78f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(modifier = Modifier.height(4.dp))
                TextButton(onClick = onChangeAccount) {
                    Text(
                        text = stringResource(R.string.main_change_account),
                        style = MaterialTheme.typography.labelLarge,
                        color = OceanDeep.copy(alpha = 0.85f),
                    )
                }
            }

            Spacer(modifier = Modifier.height(28.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Spacer(modifier = Modifier.weight(0.25f))
                MenuButton(
                    text = stringResource(R.string.main_ejercicios),
                    icon = Icons.Default.FitnessCenter,
                    modifier = Modifier.weight(0.5f),
                    onClick = onEjerciciosClick
                )
                Spacer(modifier = Modifier.weight(0.25f))
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                MenuButton(
                    text = stringResource(R.string.main_libre),
                    icon = Icons.Default.DirectionsBoat,
                    modifier = Modifier.weight(1f),
                    onClick = onLibreClick
                )
                MenuButton(
                    text = stringResource(R.string.main_competencias),
                    icon = Icons.Filled.EmojiEvents,
                    modifier = Modifier.weight(1f),
                    onClick = onCompetenciasClick,
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Spacer(modifier = Modifier.weight(0.25f))
                MenuButton(
                    text = stringResource(R.string.main_graficos),
                    icon = Icons.Filled.BarChart,
                    modifier = Modifier.weight(0.5f),
                    onClick = onGraficosClick
                )
                Spacer(modifier = Modifier.weight(0.25f))
            }

            Spacer(modifier = Modifier.height(32.dp))

            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onSalirClick),
                shape = RoundedCornerShape(12.dp),
                color = OceanDeep
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.ExitToApp,
                        contentDescription = null,
                        tint = WaveWhite,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.size(8.dp))
                    Text(
                        text = stringResource(R.string.main_salir),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Medium,
                        color = WaveWhite
                    )
                }
            }
        }
    }
}

@Composable
private fun MenuButton(
    text: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        color = SkyLight.copy(alpha = 0.4f),
        shadowElevation = 8.dp
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = OceanDeep,
                    modifier = Modifier.size(40.dp)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = text,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = OceanDeep
                )
            }
        }
    }
}
