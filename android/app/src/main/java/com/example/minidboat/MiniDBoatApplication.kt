package com.example.minidboat

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.data.AppSecurePreferences
import com.example.minidboat.data.RoutineRepository
import com.example.minidboat.data.uiLanguageCodeToLocaleListCompat
import com.example.minidboat.data.cloud.CloudRepository
import java.io.File

class MiniDBoatApplication : Application() {
    val routineRepository by lazy { RoutineRepository(this) }
    val cloudRepository by lazy { CloudRepository(this) }

    override fun onCreate() {
        super.onCreate()
        AppSecurePreferences.init(this)
        val code = AppPreferences.getUiLanguage(this)
        AppCompatDelegate.setApplicationLocales(uiLanguageCodeToLocaleListCompat(code))
        if (BuildConfig.DEBUG) {
            installDemoLibreSessionIfNeeded()
        }
    }

    /**
     * En debug, copia una sesión libre de ejemplo a filesDir para que aparezca en Gráficos
     * sin ADB (mismo formato que al guardar desde Libre).
     */
    private fun installDemoLibreSessionIfNeeded() {
        val fileName = DEMO_LIBRE_SESSION_ASSET.substringAfterLast('/')
        val outFile = File(filesDir, fileName)
        if (outFile.exists()) return
        try {
            assets.open(DEMO_LIBRE_SESSION_ASSET).use { input ->
                outFile.outputStream().use { output -> input.copyTo(output) }
            }
        } catch (_: Exception) {
            // Sin assets o APK incompleto: omitir
        }
    }

    companion object {
        private const val DEMO_LIBRE_SESSION_ASSET = "demo/libre_session_demo_remada.json"
    }
}
