package com.example.minidboat.data

import android.content.Context
import org.json.JSONObject

/**
 * Preferencias de la app. Todo el acceso al almacenamiento persistente pasa por
 * [AppSecurePreferences], que cifra los datos en reposo con AES-256-GCM.
 *
 * Datos sensibles guardados aquí:
 *  - [KEY_CLOUD_ACCESS_TOKEN] — JWT de sesión (líneas setCloudAccessToken / getCloudAccessToken)
 *  - [KEY_CLOUD_EMAIL]        — email del usuario autenticado
 *  - [KEY_LOGIN_DRAFT_PASSWORD] — contraseña en borrador del formulario de login
 */
object AppPreferences {
    private const val KEY_CACHED_API_TEAM_NAME = "cached_api_team_name"
    private const val KEY_CACHED_API_TEAM_COUNTRY = "cached_api_team_country"
    /** Id del primer equipo desde GET /teams/me; -1 si no hay. */
    private const val KEY_CACHED_API_TEAM_ID = "cached_api_team_id"
    private const val KEY_BOAT_TYPE = "boat_type"
    private const val KEY_PADDLERS_COUNT = "paddlers_count"
    private const val KEY_COUNTDOWN_SECONDS = "countdown_seconds"
    private const val KEY_STROKE_MIN_INTERVAL_MS = "stroke_min_interval_ms"
    private const val KEY_SPM_INTERVALS = "spm_intervals"
    private const val KEY_SPEED_SMOOTH_SAMPLES = "speed_smooth_samples"
    private const val KEY_DPS_STROKE_WINDOW = "dps_stroke_window"
    /** "landscape" (Pantalla parada, eje Z) o "vertical" (Pantalla acostada). Por defecto: vertical. */
    private const val KEY_STROKE_ACCEL_AXIS = "stroke_accel_axis"
    /** Entero 0–10 = sensibilidad × 10 (0,0 … 1,0). Por defecto 4 = 0,4. */
    private const val KEY_STROKE_SENSITIVITY_TENTHS = "stroke_sensitivity_tenths"
    /** Ajustes de la sección Competencias (independientes de entrenamiento libre). */
    private const val KEY_COMPETENCIA_BOAT = "competencia_boat"
    private const val KEY_COMPETENCIA_PADDLERS = "competencia_paddlers"
    private const val KEY_COMPETENCIA_DRUMMER = "competencia_drummer"
    private const val KEY_COMPETENCIA_AGE = "competencia_age"
    private const val KEY_COMPETENCIA_TEAM_TYPE = "competencia_team_type"
    private const val KEY_COMPETENCIA_DISTANCE_M = "competencia_distance_m"
    private const val KEY_COMPETENCIA_VIRADA = "competencia_virada"
    private const val KEY_CLOUD_ACCESS_TOKEN = "cloud_access_token"
    private const val KEY_CLOUD_EMAIL = "cloud_email"
    private const val KEY_GUEST_MODE = "guest_mode"
    /** Borrador para rellenar el login al abrir la app (independiente de la sesión). */
    private const val KEY_LOGIN_DRAFT_EMAIL = "login_draft_email"
    private const val KEY_LOGIN_DRAFT_PASSWORD = "login_draft_password"
    /** Mismo nombre que en el panel web (`UI_LANG_KEY`) para coherencia manual al depurar. */
    private const val KEY_UI_LANGUAGE = "edb_ui_lang"
    /** Nombres de archivo JSON de competencia pendientes de subir a la API. */
    private const val KEY_PENDING_COMPETENCIA_FILES = "pending_competencia_files"
    /** JSON: nombre de archivo → clave de cuenta que guardó la sesión (email en minúsculas o __guest__ / __no_session__). */
    private const val KEY_PENDING_COMPETENCIA_OWNERS_JSON = "pending_competencia_owners_json"

    /** Etiqueta cuando no hay equipo en la API o modo invitado. */
    const val LABEL_NO_TEAM = "Sin equipo"

    const val BOAT_TYPE_GRANDE = "grande"
    const val BOAT_TYPE_CHICO = "chico"
    const val DEFAULT_BOAT_TYPE = BOAT_TYPE_GRANDE

    const val DEFAULT_PADDLERS_COUNT = 6

    const val DEFAULT_STROKE_MIN_INTERVAL_MS = 400

    const val DEFAULT_SPEED_SMOOTH_SAMPLES = 2

    const val DEFAULT_SPM_INTERVALS = 2

    /** Cuántas últimas paladas promedian el DPS en Entrenamiento libre (1–5). */
    const val DEFAULT_DPS_STROKE_WINDOW = 2

    /** Sensibilidad por defecto (0,4) como índice 0–10. */
    const val DEFAULT_STROKE_SENSITIVITY_TENTHS = 4

    const val STROKE_ACCEL_AXIS_LANDSCAPE = "landscape"
    const val STROKE_ACCEL_AXIS_VERTICAL = "vertical"

    /** Código de idioma de la UI: mismos valores que el panel web (`es`, `en`, …). */
    fun getUiLanguage(context: Context): String {
        val raw = AppSecurePreferences.getString(KEY_UI_LANGUAGE, null)?.trim().orEmpty()
        return if (isValidUiLanguageCode(raw)) raw else DEFAULT_UI_LANGUAGE_CODE
    }

    fun setUiLanguage(context: Context, code: String) {
        if (!isValidUiLanguageCode(code)) return
        AppSecurePreferences.putString(KEY_UI_LANGUAGE, code)
    }

    fun getCachedApiTeamName(context: Context): String? =
        AppSecurePreferences.getString(KEY_CACHED_API_TEAM_NAME, null)?.takeIf { it.isNotBlank() }

    fun setCachedApiTeamName(context: Context, name: String?) {
        if (name.isNullOrBlank()) AppSecurePreferences.remove(KEY_CACHED_API_TEAM_NAME)
        else AppSecurePreferences.putString(KEY_CACHED_API_TEAM_NAME, name)
    }

    fun clearCachedApiTeamName(context: Context) {
        AppSecurePreferences.remove(KEY_CACHED_API_TEAM_NAME)
    }

    /** Id numérico del equipo en la API (p. ej. importar rutinas). -1 si no está en caché. */
    fun getCachedApiTeamId(context: Context): Int =
        AppSecurePreferences.getInt(KEY_CACHED_API_TEAM_ID, -1)

    fun setCachedApiTeamId(context: Context, teamId: Int) {
        if (teamId < 0) AppSecurePreferences.remove(KEY_CACHED_API_TEAM_ID)
        else AppSecurePreferences.putInt(KEY_CACHED_API_TEAM_ID, teamId)
    }

    fun getCachedApiTeamCountry(context: Context): String? =
        AppSecurePreferences.getString(KEY_CACHED_API_TEAM_COUNTRY, null)?.takeIf { it.isNotBlank() }

    fun setCachedApiTeamCountry(context: Context, country: String?) {
        if (country.isNullOrBlank()) AppSecurePreferences.remove(KEY_CACHED_API_TEAM_COUNTRY)
        else AppSecurePreferences.putString(KEY_CACHED_API_TEAM_COUNTRY, country)
    }

    /** Equipo para metadatos de sesión libre y textos: API en caché o "Sin equipo". */
    fun getTeamDisplayForSession(context: Context): String {
        if (isGuestMode(context)) return LABEL_NO_TEAM
        if (!isCloudLoggedIn(context)) return LABEL_NO_TEAM
        return getCachedApiTeamName(context) ?: LABEL_NO_TEAM
    }

    fun getBoatType(context: Context): String {
        val v = AppSecurePreferences.getString(KEY_BOAT_TYPE, DEFAULT_BOAT_TYPE) ?: DEFAULT_BOAT_TYPE
        return if (v == BOAT_TYPE_GRANDE || v == BOAT_TYPE_CHICO) v else DEFAULT_BOAT_TYPE
    }

    fun setBoatType(context: Context, type: String) {
        AppSecurePreferences.putString(KEY_BOAT_TYPE, type)
    }

    fun getPaddlersCount(context: Context): Int =
        AppSecurePreferences.getInt(KEY_PADDLERS_COUNT, DEFAULT_PADDLERS_COUNT).coerceIn(1, 20)

    /** Línea bajo el título en la imagen JPG del entrenamiento libre: equipo · bote · palistas */
    fun getLibreShareImageSecondLine(context: Context): String {
        val team = getTeamDisplayForSession(context)
        val boatLabel = when (getBoatType(context)) {
            BOAT_TYPE_GRANDE -> "Grande"
            else -> "Chico"
        }
        val n = getPaddlersCount(context)
        return "$team · $boatLabel · $n palistas"
    }

    fun setPaddlersCount(context: Context, count: Int) {
        AppSecurePreferences.putInt(KEY_PADDLERS_COUNT, count)
    }

    fun getCountdownSeconds(context: Context): Int =
        AppSecurePreferences.getInt(KEY_COUNTDOWN_SECONDS, 0)

    fun setCountdownSeconds(context: Context, seconds: Int) {
        AppSecurePreferences.putInt(KEY_COUNTDOWN_SECONDS, seconds)
    }

    fun getStrokeMinIntervalMs(context: Context): Int {
        val v = AppSecurePreferences.getInt(KEY_STROKE_MIN_INTERVAL_MS, DEFAULT_STROKE_MIN_INTERVAL_MS)
        return if (v in strokeMinIntervalMsOptions) v else DEFAULT_STROKE_MIN_INTERVAL_MS
    }

    fun setStrokeMinIntervalMs(context: Context, ms: Int) {
        AppSecurePreferences.putInt(KEY_STROKE_MIN_INTERVAL_MS, ms)
    }

    fun getSpmIntervals(context: Context): Int =
        AppSecurePreferences.getInt(KEY_SPM_INTERVALS, DEFAULT_SPM_INTERVALS).coerceIn(1, 5)

    fun setSpmIntervals(context: Context, intervals: Int) {
        AppSecurePreferences.putInt(KEY_SPM_INTERVALS, intervals)
    }

    fun getSpeedSmoothSamples(context: Context): Int =
        AppSecurePreferences.getInt(KEY_SPEED_SMOOTH_SAMPLES, DEFAULT_SPEED_SMOOTH_SAMPLES).coerceIn(1, 6)

    fun setSpeedSmoothSamples(context: Context, samples: Int) {
        AppSecurePreferences.putInt(KEY_SPEED_SMOOTH_SAMPLES, samples)
    }

    fun getDpsStrokeWindow(context: Context): Int =
        AppSecurePreferences.getInt(KEY_DPS_STROKE_WINDOW, DEFAULT_DPS_STROKE_WINDOW).coerceIn(1, 5)

    fun setDpsStrokeWindow(context: Context, strokes: Int) {
        AppSecurePreferences.putInt(KEY_DPS_STROKE_WINDOW, strokes.coerceIn(1, 5))
    }

    /** true = Pantalla parada (eje Z); false = Pantalla acostada (plano pantalla, vertical). Por defecto: acostada. */
    fun getStrokeAccelAxisIsLandscape(context: Context): Boolean {
        val v = AppSecurePreferences.getString(KEY_STROKE_ACCEL_AXIS, STROKE_ACCEL_AXIS_VERTICAL)
            ?: STROKE_ACCEL_AXIS_VERTICAL
        return v != STROKE_ACCEL_AXIS_VERTICAL
    }

    fun setStrokeAccelAxisLandscape(context: Context, landscape: Boolean) {
        AppSecurePreferences.putString(
            KEY_STROKE_ACCEL_AXIS,
            if (landscape) STROKE_ACCEL_AXIS_LANDSCAPE else STROKE_ACCEL_AXIS_VERTICAL,
        )
    }

    /** 0,0 … 1,0 en pasos de 0,1. */
    fun getStrokeSensitivityTenths(context: Context): Int =
        AppSecurePreferences.getInt(KEY_STROKE_SENSITIVITY_TENTHS, DEFAULT_STROKE_SENSITIVITY_TENTHS)
            .coerceIn(0, 10)

    fun setStrokeSensitivityTenths(context: Context, tenths: Int) {
        AppSecurePreferences.putInt(KEY_STROKE_SENSITIVITY_TENTHS, tenths.coerceIn(0, 10))
    }

    fun getStrokeSensitivity(context: Context): Float = getStrokeSensitivityTenths(context) / 10f

    val boatTypeOptions = listOf(BOAT_TYPE_GRANDE, BOAT_TYPE_CHICO)

    val paddlersCountOptions = (1..20).toList()

    val countdownOptions = listOf(0, 3, 5, 10)

    /** 100 ms a 800 ms, de 100 en 100. */
    val strokeMinIntervalMsOptions: List<Int> = (100..800 step 100).toList()

    val spmIntervalsOptions = listOf(1, 2, 3, 4, 5)

    val speedSmoothSamplesOptions = listOf(1, 2, 3, 4, 5, 6)

    val dpsStrokeWindowOptions = listOf(1, 2, 3, 4, 5)

    const val COMPETENCIA_PADDLERS_10 = 10
    const val COMPETENCIA_PADDLERS_20 = 20
    val competenciaPaddlersOptions = listOf(COMPETENCIA_PADDLERS_10, COMPETENCIA_PADDLERS_20)

    const val COMPETENCIA_AGE_PREMIER = "premier"
    const val COMPETENCIA_AGE_SENIOR_A = "senior_a"
    const val COMPETENCIA_AGE_SENIOR_B = "senior_b"
    const val COMPETENCIA_AGE_SENIOR_C = "senior_c"
    val competenciaAgeOptions = listOf(
        COMPETENCIA_AGE_PREMIER,
        COMPETENCIA_AGE_SENIOR_A,
        COMPETENCIA_AGE_SENIOR_B,
        COMPETENCIA_AGE_SENIOR_C,
    )

    const val COMPETENCIA_TEAM_OPEN = "open"
    const val COMPETENCIA_TEAM_MIXTO = "mixto"
    const val COMPETENCIA_TEAM_DAMAS = "damas"
    const val COMPETENCIA_TEAM_ACS = "acs"
    val competenciaTeamTypeOptions = listOf(
        COMPETENCIA_TEAM_OPEN,
        COMPETENCIA_TEAM_MIXTO,
        COMPETENCIA_TEAM_DAMAS,
        COMPETENCIA_TEAM_ACS,
    )

    val competenciaDistanceOptionsM = listOf(200, 500, 1000, 2000)

    fun getCompetenciaDistanceMeters(context: Context): Int {
        val v = AppSecurePreferences.getInt(KEY_COMPETENCIA_DISTANCE_M, 500)
        return if (v in competenciaDistanceOptionsM) v else 500
    }

    fun setCompetenciaDistanceMeters(context: Context, meters: Int) {
        AppSecurePreferences.putInt(KEY_COMPETENCIA_DISTANCE_M, meters)
    }

    /** Virada: por defecto no. */
    fun getCompetenciaVirada(context: Context): Boolean =
        AppSecurePreferences.getBoolean(KEY_COMPETENCIA_VIRADA, false)

    fun setCompetenciaVirada(context: Context, value: Boolean) {
        AppSecurePreferences.putBoolean(KEY_COMPETENCIA_VIRADA, value)
    }

    fun getCompetenciaBoatType(context: Context): String {
        val v = AppSecurePreferences.getString(KEY_COMPETENCIA_BOAT, BOAT_TYPE_GRANDE) ?: BOAT_TYPE_GRANDE
        return if (v == BOAT_TYPE_GRANDE || v == BOAT_TYPE_CHICO) v else BOAT_TYPE_GRANDE
    }

    fun setCompetenciaBoatType(context: Context, type: String) {
        AppSecurePreferences.putString(KEY_COMPETENCIA_BOAT, type)
    }

    fun getCompetenciaPaddlers(context: Context): Int {
        val v = AppSecurePreferences.getInt(KEY_COMPETENCIA_PADDLERS, COMPETENCIA_PADDLERS_20)
        return if (v in competenciaPaddlersOptions) v else COMPETENCIA_PADDLERS_20
    }

    fun setCompetenciaPaddlers(context: Context, count: Int) {
        AppSecurePreferences.putInt(KEY_COMPETENCIA_PADDLERS, count)
    }

    fun getCompetenciaDrummer(context: Context): Boolean =
        AppSecurePreferences.getBoolean(KEY_COMPETENCIA_DRUMMER, false)

    fun setCompetenciaDrummer(context: Context, value: Boolean) {
        AppSecurePreferences.putBoolean(KEY_COMPETENCIA_DRUMMER, value)
    }

    fun getCompetenciaAgeCategory(context: Context): String {
        val v = AppSecurePreferences.getString(KEY_COMPETENCIA_AGE, COMPETENCIA_AGE_PREMIER)
            ?: COMPETENCIA_AGE_PREMIER
        return if (v in competenciaAgeOptions) v else COMPETENCIA_AGE_PREMIER
    }

    fun setCompetenciaAgeCategory(context: Context, value: String) {
        AppSecurePreferences.putString(KEY_COMPETENCIA_AGE, value)
    }

    fun getCompetenciaTeamType(context: Context): String {
        val v = AppSecurePreferences.getString(KEY_COMPETENCIA_TEAM_TYPE, COMPETENCIA_TEAM_OPEN)
            ?: COMPETENCIA_TEAM_OPEN
        return if (v in competenciaTeamTypeOptions) v else COMPETENCIA_TEAM_OPEN
    }

    fun setCompetenciaTeamType(context: Context, value: String) {
        AppSecurePreferences.putString(KEY_COMPETENCIA_TEAM_TYPE, value)
    }

    // ── Token JWT y sesión en la nube ────────────────────────────────────────────
    // El access token se guarda cifrado en AppSecurePreferences.
    // Lectura: getCloudAccessToken  (líneas ~220–221)
    // Escritura: setCloudAccessToken (líneas ~224–225)

    fun getCloudAccessToken(context: Context): String? =
        AppSecurePreferences.getString(KEY_CLOUD_ACCESS_TOKEN, null)?.takeIf { it.isNotBlank() }

    fun setCloudAccessToken(context: Context, token: String) {
        AppSecurePreferences.putString(KEY_CLOUD_ACCESS_TOKEN, token)
    }

    fun getCloudEmail(context: Context): String? =
        AppSecurePreferences.getString(KEY_CLOUD_EMAIL, null)?.takeIf { it.isNotBlank() }

    fun setCloudEmail(context: Context, email: String) {
        AppSecurePreferences.putString(KEY_CLOUD_EMAIL, email)
    }

    fun clearCloudSession(context: Context) {
        AppSecurePreferences.edit()
            .remove(KEY_CLOUD_ACCESS_TOKEN)
            .remove(KEY_CLOUD_EMAIL)
            .remove(KEY_CACHED_API_TEAM_NAME)
            .remove(KEY_CACHED_API_TEAM_COUNTRY)
            .remove(KEY_CACHED_API_TEAM_ID)
            .apply()
    }

    fun isCloudLoggedIn(context: Context): Boolean =
        !getCloudAccessToken(context).isNullOrBlank()

    /** Modo invitado: uso local sin cuenta; no se suben sesiones a la nube. */
    fun isGuestMode(context: Context): Boolean =
        AppSecurePreferences.getBoolean(KEY_GUEST_MODE, false)

    fun setGuestMode(context: Context, guest: Boolean) {
        AppSecurePreferences.putBoolean(KEY_GUEST_MODE, guest)
    }

    fun getLoginDraftEmail(context: Context): String =
        AppSecurePreferences.getString(KEY_LOGIN_DRAFT_EMAIL, "") ?: ""

    fun setLoginDraftEmail(context: Context, value: String) {
        AppSecurePreferences.putString(KEY_LOGIN_DRAFT_EMAIL, value)
    }

    fun getLoginDraftPassword(context: Context): String =
        AppSecurePreferences.getString(KEY_LOGIN_DRAFT_PASSWORD, "") ?: ""

    fun setLoginDraftPassword(context: Context, value: String) {
        AppSecurePreferences.putString(KEY_LOGIN_DRAFT_PASSWORD, value)
    }

    /**
     * Clave de cuenta al guardar una competencia pendiente: misma lógica para listar y reenviar.
     * Así, si otro usuario inicia sesión en el mismo teléfono, no ve ni envía los JSON del anterior.
     */
    fun accountKeyForPendingCompetencia(context: Context): String {
        if (isGuestMode(context)) return "__guest__"
        val email = getCloudEmail(context)?.trim()?.lowercase()
        return if (!email.isNullOrEmpty()) email else "__no_session__"
    }

    private fun readPendingCompetenciaOwnersMap(context: Context): MutableMap<String, String> {
        val raw = AppSecurePreferences.getString(KEY_PENDING_COMPETENCIA_OWNERS_JSON, null) ?: return mutableMapOf()
        return try {
            val o = JSONObject(raw)
            val m = mutableMapOf<String, String>()
            val it = o.keys()
            while (it.hasNext()) {
                val k = it.next()
                m[k] = o.optString(k, "")
            }
            m
        } catch (_: Exception) {
            mutableMapOf()
        }
    }

    private fun writePendingCompetenciaOwnersMap(context: Context, map: Map<String, String>) {
        if (map.isEmpty()) {
            AppSecurePreferences.remove(KEY_PENDING_COMPETENCIA_OWNERS_JSON)
        } else {
            val o = JSONObject()
            for ((k, v) in map) o.put(k, v)
            AppSecurePreferences.putString(KEY_PENDING_COMPETENCIA_OWNERS_JSON, o.toString())
        }
    }

    /** Todos los archivos marcados como pendientes (sin filtrar por cuenta). */
    fun getPendingCompetenciaFileNames(context: Context): Set<String> =
        AppSecurePreferences.getStringSet(KEY_PENDING_COMPETENCIA_FILES, emptySet())

    /** Pendientes de la cuenta actual (sesión / invitado / sin sesión según corresponda). */
    fun getPendingCompetenciaFileNamesForCurrentAccount(context: Context): Set<String> {
        val account = accountKeyForPendingCompetencia(context)
        val owners = readPendingCompetenciaOwnersMap(context)
        return getPendingCompetenciaFileNames(context).filter { fn ->
            owners[fn] == account
        }.toSet()
    }

    fun pendingCompetenciaCount(context: Context): Int =
        getPendingCompetenciaFileNamesForCurrentAccount(context).size

    fun addPendingCompetenciaFile(context: Context, fileName: String) {
        addPendingCompetenciaFile(context, fileName, accountKeyForPendingCompetencia(context))
    }

    fun addPendingCompetenciaFile(context: Context, fileName: String, ownerAccountKey: String) {
        val name = fileName.trim()
        if (name.isEmpty()) return
        val cur = AppSecurePreferences.getStringSet(KEY_PENDING_COMPETENCIA_FILES, emptySet())
        val next = HashSet(cur)
        next.add(name)
        AppSecurePreferences.putStringSet(KEY_PENDING_COMPETENCIA_FILES, next)
        val owners = readPendingCompetenciaOwnersMap(context)
        owners[name] = ownerAccountKey
        writePendingCompetenciaOwnersMap(context, owners)
    }

    fun removePendingCompetenciaFile(context: Context, fileName: String) {
        val cur = AppSecurePreferences.getStringSet(KEY_PENDING_COMPETENCIA_FILES, emptySet())
        val next = HashSet(cur)
        next.remove(fileName)
        if (next.isEmpty()) AppSecurePreferences.remove(KEY_PENDING_COMPETENCIA_FILES)
        else AppSecurePreferences.putStringSet(KEY_PENDING_COMPETENCIA_FILES, next)
        val owners = readPendingCompetenciaOwnersMap(context)
        owners.remove(fileName)
        writePendingCompetenciaOwnersMap(context, owners)
    }

    /**
     * Versiones anteriores solo guardaban la lista de archivos: asigna propietario a entradas sin mapa.
     * Debe ejecutarse antes de contar o reenviar pendientes.
     */
    fun syncMissingOwnersForPendingFiles(context: Context) {
        val names = getPendingCompetenciaFileNames(context)
        if (names.isEmpty()) return
        val owners = readPendingCompetenciaOwnersMap(context).toMutableMap()
        var changed = false
        val key = accountKeyForPendingCompetencia(context)
        for (n in names) {
            if (owners[n] == null) {
                owners[n] = key
                changed = true
            }
        }
        if (changed) writePendingCompetenciaOwnersMap(context, owners)
    }

    /**
     * Cola guardada sin sesión (clave `__no_session__`): al iniciar sesión,
     * pasa a la cuenta actual para poder enviarla desde Configuración.
     */
    fun claimNoSessionPendingFilesForLoggedInUser(context: Context) {
        if (!isCloudLoggedIn(context) || isGuestMode(context)) return
        val email = getCloudEmail(context)?.trim()?.lowercase() ?: return
        val owners = readPendingCompetenciaOwnersMap(context).toMutableMap()
        var changed = false
        for (k in owners.keys.toList()) {
            if (owners[k] == "__no_session__") {
                owners[k] = email
                changed = true
            }
        }
        if (changed) writePendingCompetenciaOwnersMap(context, owners)
    }

    private const val COMPETENCIA_FILE_PREFIX = "competencia_session_"

    /**
     * Añade a la cola de pendientes los JSON de competencia que ya existan en [Context.filesDir]
     * pero no estén registrados (p. ej. sesiones guardadas antes de esta versión).
     */
    fun backfillPendingCompetenciaFiles(context: Context) {
        val dir = context.filesDir
        val already = getPendingCompetenciaFileNames(context)
        val ownerKey = accountKeyForPendingCompetencia(context)
        val files = dir.listFiles { f ->
            f.isFile && f.name.startsWith(COMPETENCIA_FILE_PREFIX) && f.name.endsWith(".json")
        } ?: return
        for (f in files) {
            if (f.name !in already) {
                addPendingCompetenciaFile(context, f.name, ownerKey)
            }
        }
        syncMissingOwnersForPendingFiles(context)
    }

    /**
     * Al abrir la app (nuevo proceso): sin sesión en nube ni invitado; el usuario debe volver a acceder.
     * No borra el borrador de email/contraseña del formulario de login.
     */
    fun resetSessionForAppLaunch(context: Context) {
        AppSecurePreferences.edit()
            .remove(KEY_CLOUD_ACCESS_TOKEN)
            .remove(KEY_CLOUD_EMAIL)
            .remove(KEY_CACHED_API_TEAM_NAME)
            .remove(KEY_CACHED_API_TEAM_COUNTRY)
            .putBoolean(KEY_GUEST_MODE, false)
            .apply()
    }
}
