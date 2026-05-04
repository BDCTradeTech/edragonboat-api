package com.example.minidboat.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.OceanLight
import com.example.minidboat.ui.theme.SkyBlue
import com.example.minidboat.ui.theme.SkyLight
import com.example.minidboat.ui.theme.SkyPale
import com.example.minidboat.ui.theme.WaveWhite
import com.example.minidboat.ui.theme.MistLight

private val DarkColorScheme = darkColorScheme(
    primary = SkyPale,
    secondary = SkyBlue,
    tertiary = OceanLight,
    background = OceanDeep,
    surface = OceanDeep
)

private val LightColorScheme = lightColorScheme(
    primary = OceanMid,
    secondary = SkyBlue,
    tertiary = SkyLight,
    background = MistLight,
    surface = WaveWhite
)

@Composable
fun MiniDBoatTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // Dynamic color is available on Android 12+
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    // Tras setApplicationLocales(), la configuración cambia: esto hace que stringResource() se vuelva a leer.
    @Suppress("UNUSED_VARIABLE")
    val configuration = LocalConfiguration.current
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }

        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}