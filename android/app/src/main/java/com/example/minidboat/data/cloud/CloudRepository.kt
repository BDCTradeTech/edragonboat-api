package com.example.minidboat.data.cloud

import android.content.Context
import com.example.minidboat.BuildConfig
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.data.Routine
import com.google.gson.GsonBuilder
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

class CloudRepository(context: Context) {

    private val appContext = context.applicationContext

    private val client: OkHttpClient by lazy {
        val builder = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val token = AppPreferences.getCloudAccessToken(appContext)
                val req = if (!token.isNullOrBlank()) {
                    chain.request().newBuilder()
                        .header("Authorization", "Bearer $token")
                        .build()
                } else {
                    chain.request()
                }
                chain.proceed(req)
            }
        if (BuildConfig.DEBUG) {
            builder.addInterceptor(
                HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BODY },
            )
        }
        builder.build()
    }

    private val api: EdragonboatApi by lazy {
        val gson = GsonBuilder().serializeNulls().create()
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
            .create(EdragonboatApi::class.java)
    }

    suspend fun login(email: String, password: String) = withContext(Dispatchers.IO) {
        val res = api.login(email.trim(), password)
        AppPreferences.setCloudAccessToken(appContext, res.access_token)
        AppPreferences.setCloudEmail(appContext, email.trim())
        AppPreferences.setGuestMode(appContext, false)
        AppPreferences.claimNoSessionPendingFilesForLoggedInUser(appContext)
    }

    /**
     * Equipo principal desde la API (primer equipo de la lista). Actualiza caché local para sesiones y UI.
     */
    suspend fun refreshCachedTeamFromApi(): String = withContext(Dispatchers.IO) {
        try {
            val list = api.getMyTeams()
            val first = list.firstOrNull()?.team
            if (first == null) {
                AppPreferences.setCachedApiTeamName(appContext, null)
                AppPreferences.setCachedApiTeamCountry(appContext, null)
                AppPreferences.setCachedApiTeamId(appContext, -1)
                return@withContext AppPreferences.LABEL_NO_TEAM
            }
            val name = first.name.trim().takeIf { it.isNotEmpty() }
            val country = first.country?.trim()?.takeIf { it.isNotEmpty() }
            val label = name ?: AppPreferences.LABEL_NO_TEAM
            AppPreferences.setCachedApiTeamName(appContext, name)
            AppPreferences.setCachedApiTeamCountry(appContext, country)
            AppPreferences.setCachedApiTeamId(appContext, first.id)
            label
        } catch (_: Exception) {
            AppPreferences.getCachedApiTeamName(appContext) ?: AppPreferences.LABEL_NO_TEAM
        }
    }

    /** Rutinas del equipo (misma API que el panel web). Requiere sesión en la nube. */
    suspend fun fetchTeamRoutines(teamId: Int): List<Routine> = withContext(Dispatchers.IO) {
        if (!AppPreferences.isCloudLoggedIn(appContext)) return@withContext emptyList()
        val dtoList = api.listRoutines(teamId)
        dtoList.map { RoutineApiMapper.toRoutine(it) }
    }

    fun logout() {
        AppPreferences.clearCloudSession(appContext)
        AppPreferences.setGuestMode(appContext, false)
    }

    /**
     * Sube la sesión si hay token guardado (Configuración → cuenta).
     * Errores silenciados para no afectar el guardado local.
     */
    suspend fun uploadLibreSessionIfSignedIn(json: String) = withContext(Dispatchers.IO) {
        if (!AppPreferences.isCloudLoggedIn(appContext)) return@withContext
        try {
            val body = json.toRequestBody("application/json; charset=utf-8".toMediaType())
            api.uploadLibreSession(body)
        } catch (_: Exception) {
            // Log local opcional; la sesión ya está en disco
        }
    }

    suspend fun uploadCompetenciaSessionIfSignedIn(json: String) = withContext(Dispatchers.IO) {
        uploadCompetenciaSessionWithResult(json)
    }

    /** Resultado explícito para UI y reintentos (sin sesión → failure). */
    suspend fun uploadCompetenciaSessionWithResult(json: String): Result<Unit> = withContext(Dispatchers.IO) {
        if (!AppPreferences.isCloudLoggedIn(appContext)) {
            return@withContext Result.failure(IllegalStateException("Sin sesión en la nube"))
        }
        try {
            val body = json.toRequestBody("application/json; charset=utf-8".toMediaType())
            api.uploadCompetenciaSession(body)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Reintenta subir todos los JSON pendientes (archivos en filesDir).
     * @return Pair(enviadas_ok, fallidas)
     */
    suspend fun retryPendingCompetenciaUploads(): Pair<Int, Int> = withContext(Dispatchers.IO) {
        if (!AppPreferences.isCloudLoggedIn(appContext)) return@withContext 0 to 0
        val names = AppPreferences.getPendingCompetenciaFileNamesForCurrentAccount(appContext).toList()
        var ok = 0
        var fail = 0
        for (name in names) {
            val f = File(appContext.filesDir, name)
            if (!f.isFile) {
                AppPreferences.removePendingCompetenciaFile(appContext, name)
                continue
            }
            val json = try {
                f.readText(Charsets.UTF_8)
            } catch (_: Exception) {
                fail++
                continue
            }
            val up = uploadCompetenciaSessionWithResult(json)
            if (up.isSuccess) {
                AppPreferences.removePendingCompetenciaFile(appContext, name)
                try {
                    f.delete()
                } catch (_: Exception) {
                }
                ok++
            } else {
                fail++
            }
        }
        ok to fail
    }
}
