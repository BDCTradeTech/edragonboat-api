package com.example.minidboat.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Wrapper singleton sobre [EncryptedSharedPreferences].
 *
 * Reemplaza el acceso directo a [SharedPreferences] en todo el proyecto para que
 * el token JWT y el resto de datos sensibles (email, contraseña draft, etc.) queden
 * cifrados en reposo con AES-256-GCM.
 *
 * IMPORTANTE: [EncryptedSharedPreferences] (security-crypto 1.1.0-alpha06) no soporta
 * [SharedPreferences.Editor.putStringSet] ni [SharedPreferences.getStringSet].
 * Los métodos [putStringSet] y [getStringSet] de esta clase codifican el conjunto como
 * JSON string internamente para mantener compatibilidad de API con el código existente.
 *
 * Inicialización: llamar a [init] desde [android.app.Application.onCreate] antes de
 * cualquier otro acceso.
 */
object AppSecurePreferences {

    private const val PREFS_NAME = "secure_prefs"

    // Separador interno para la serialización de StringSet → no puede aparecer en valores reales.
    private const val SET_SEPARATOR = "|||"

    @Volatile
    private var prefs: SharedPreferences? = null

    /**
     * Inicializa las preferencias cifradas. Debe llamarse una sola vez en
     * [android.app.Application.onCreate]. Es seguro llamarlo varias veces
     * (las llamadas adicionales son no-op).
     */
    fun init(context: Context) {
        if (prefs != null) return
        synchronized(this) {
            if (prefs != null) return
            val masterKey = MasterKey.Builder(context.applicationContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            prefs = EncryptedSharedPreferences.create(
                context.applicationContext,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }
    }

    private fun requirePrefs(): SharedPreferences =
        checkNotNull(prefs) {
            "AppSecurePreferences no fue inicializado. Llamá AppSecurePreferences.init(context) en Application.onCreate()."
        }

    // ── Acceso genérico ──────────────────────────────────────────────────────────

    fun getString(key: String, defValue: String?): String? =
        requirePrefs().getString(key, defValue)

    fun putString(key: String, value: String?) {
        requirePrefs().edit().putString(key, value).apply()
    }

    fun getInt(key: String, defValue: Int): Int =
        requirePrefs().getInt(key, defValue)

    fun putInt(key: String, value: Int) {
        requirePrefs().edit().putInt(key, value).apply()
    }

    fun getBoolean(key: String, defValue: Boolean): Boolean =
        requirePrefs().getBoolean(key, defValue)

    fun putBoolean(key: String, value: Boolean) {
        requirePrefs().edit().putBoolean(key, value).apply()
    }

    fun getFloat(key: String, defValue: Float): Float =
        requirePrefs().getFloat(key, defValue)

    fun putFloat(key: String, value: Float) {
        requirePrefs().edit().putFloat(key, value).apply()
    }

    fun getLong(key: String, defValue: Long): Long =
        requirePrefs().getLong(key, defValue)

    fun putLong(key: String, value: Long) {
        requirePrefs().edit().putLong(key, value).apply()
    }

    /**
     * Emula [SharedPreferences.getStringSet] serializando el conjunto como string delimitado.
     * Compatible con [EncryptedSharedPreferences] que no admite StringSet nativo.
     */
    fun getStringSet(key: String, defValues: Set<String>?): Set<String> {
        val raw = requirePrefs().getString(key, null) ?: return defValues?.toHashSet() ?: emptySet()
        return if (raw.isEmpty()) emptySet() else raw.split(SET_SEPARATOR).toHashSet()
    }

    /**
     * Emula [SharedPreferences.Editor.putStringSet] serializando el conjunto como string delimitado.
     */
    fun putStringSet(key: String, values: Set<String>?) {
        val encoded = values?.joinToString(SET_SEPARATOR) ?: ""
        requirePrefs().edit().putString(key, encoded).apply()
    }

    fun remove(key: String) {
        requirePrefs().edit().remove(key).apply()
    }

    fun contains(key: String): Boolean =
        requirePrefs().contains(key)

    /**
     * Retorna un [SharedPreferences.Editor] para operaciones de múltiples claves atómicas.
     * Nota: [SharedPreferences.Editor.putStringSet] en el editor nativo no está soportado —
     * usar [putStringSet] de este objeto en su lugar.
     */
    fun edit(): SharedPreferences.Editor = requirePrefs().edit()
}
