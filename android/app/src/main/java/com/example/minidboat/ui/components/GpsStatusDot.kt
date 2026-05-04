package com.example.minidboat.ui.components

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.GnssStatus
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

private val GpsOkGreen = Color(0xFF2E7D32)
private val GpsNoRed = Color(0xFFC62828)

/**
 * Punto verde si hay señal GPS útil (satélites en fix, correcciones en vivo o última posición reciente);
 * rojo si no hay permiso, el GPS está apagado o no hay señal.
 * Usa [LocationManager.requestLocationUpdates] en el GPS para pasar a verde en cuanto llega una posición,
 * sin depender solo del sondeo de lastKnown (antes 2 s) ni del callback GNSS.
 */
@Composable
fun GpsStatusDot(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val locationManager = remember {
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    }

    val hasPermission =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    var gnssUsedInFix by remember { mutableStateOf(false) }
    var recentGpsFix by remember { mutableStateOf(false) }
    var gpsEnabled by remember {
        mutableStateOf(locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER))
    }

    DisposableEffect(locationManager, hasPermission, gpsEnabled) {
        if (!hasPermission || !gpsEnabled) {
            gnssUsedInFix = false
            return@DisposableEffect onDispose { }
        }

        val mainExecutor = ContextCompat.getMainExecutor(context)
        val locListener = LocationListener {
            mainExecutor.execute { recentGpsFix = true }
        }
        try {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                400L,
                0f,
                locListener,
            )
        } catch (_: SecurityException) {
        } catch (_: Exception) {
        }

        onDispose {
            try {
                locationManager.removeUpdates(locListener)
            } catch (_: Exception) {
            }
        }
    }

    DisposableEffect(locationManager, hasPermission, gpsEnabled) {
        if (!hasPermission || !gpsEnabled) {
            gnssUsedInFix = false
            return@DisposableEffect onDispose { }
        }

        val executor = ContextCompat.getMainExecutor(context)
        val callback = object : GnssStatus.Callback() {
            override fun onSatelliteStatusChanged(status: GnssStatus) {
                var any = false
                for (i in 0 until status.satelliteCount) {
                    if (status.usedInFix(i)) {
                        any = true
                        break
                    }
                }
                gnssUsedInFix = any
            }

            override fun onStopped() {
                gnssUsedInFix = false
            }
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                locationManager.registerGnssStatusCallback(executor, callback)
            } else {
                @Suppress("DEPRECATION")
                locationManager.registerGnssStatusCallback(callback, Handler(Looper.getMainLooper()))
            }
        } catch (_: SecurityException) {
            gnssUsedInFix = false
        }
        onDispose {
            try {
                locationManager.unregisterGnssStatusCallback(callback)
            } catch (_: Exception) {
            }
        }
    }

    LaunchedEffect(hasPermission, locationManager) {
        while (isActive) {
            gpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            if (!hasPermission || !gpsEnabled) {
                recentGpsFix = false
            } else {
                recentGpsFix = recentGpsFix || hasRecentGpsLocation(locationManager)
            }
            delay(800)
        }
    }

    val hasSignal = hasPermission &&
        gpsEnabled &&
        (gnssUsedInFix || recentGpsFix)

    val desc = if (hasSignal) "GPS con señal" else "GPS sin señal o desactivado"

    Box(
        modifier = modifier
            .size(10.dp)
            .background(
                color = if (hasSignal) GpsOkGreen else GpsNoRed,
                shape = CircleShape
            )
            .semantics { contentDescription = desc }
    )
}

private fun hasRecentGpsLocation(locationManager: LocationManager): Boolean {
    return try {
        val loc = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER) ?: return false
        val ageNs = android.os.SystemClock.elapsedRealtimeNanos() - loc.elapsedRealtimeNanos
        val ageSec = ageNs / 1_000_000_000L
        ageSec in 0..20L
    } catch (_: SecurityException) {
        false
    }
}
