package com.example.minidboat.data

import android.content.Context
import com.example.minidboat.MiniDBoatApplication
import com.example.minidboat.viewmodel.LibreSessionDataPoint
import org.json.JSONObject
import java.io.File
import java.util.Locale

/**
 * Responsable de serializar sesiones a JSON y persistirlas en [Context.filesDir].
 *
 * Responsabilidades:
 *  - Serialización manual de [LibreSessionDataPoint] a JSON (sin reflexión, para control
 *    exacto de formato numérico compatible con el backend).
 *  - Construcción de los JSON de sesión Libre y Competencia.
 *  - Escritura y eliminación de archivos en filesDir.
 *  - Disparo del upload al CloudRepository si el usuario tiene sesión iniciada.
 *
 * @param appContext applicationContext; no se guarda como mutable.
 */
class SessionRepository(private val appContext: Context) {

    // ── Helpers de formato ───────────────────────────────────────────────────────

    private fun jsonSecondsField2(sec: Long): String =
        String.format(Locale.US, "%.2f", sec.toDouble())

    private fun jsonFloatField2(f: Float): String =
        String.format(Locale.US, "%.2f", f.toDouble())

    private fun dataPointToJson(p: LibreSessionDataPoint): String {
        val lat = p.latitude?.let { String.format(Locale.US, "%.8f", it) } ?: "null"
        val lon = p.longitude?.let { String.format(Locale.US, "%.8f", it) } ?: "null"
        val acc = p.locationAccuracyM?.let { String.format(Locale.US, "%.6f", it) } ?: "null"
        val dm = String.format(Locale.US, "%.15g", p.distanceMeters.toDouble())
        val sec = jsonSecondsField2(p.second)
        val sk = jsonFloatField2(p.speedKmh)
        val peak = p.strokePeakAccelerationMs2
            ?.let { String.format(Locale.US, "%.15g", it.toDouble()) } ?: "null"
        val dps = jsonFloatField2(p.dpsMeters)
        return "{\"second\":$sec,\"distanceMeters\":$dm,\"speedKmh\":$sk,\"paladas\":${p.paladas}," +
            "\"spm\":${p.spm},\"dpsMeters\":$dps,\"latitude\":$lat,\"longitude\":$lon," +
            "\"locationAccuracyM\":$acc,\"strokePeakAccelerationMs2\":$peak}"
    }

    // ── Construcción de JSON de sesión Libre ─────────────────────────────────────

    fun buildLibreSessionJsonString(
        sessionStartTimeIso: String,
        totalSeconds: Long,
        points: List<LibreSessionDataPoint>,
        teamName: String?,
        boatType: String?,
        paddlersCount: Int?,
    ): String {
        val dataPointsJson = points.joinToString(",", transform = ::dataPointToJson)
        val tn = teamName?.let { JSONObject.quote(it) } ?: "null"
        val bt = boatType?.let { JSONObject.quote(it) } ?: "null"
        val pc = paddlersCount?.toString() ?: "null"
        val totalSecJson = jsonSecondsField2(totalSeconds)
        return "{\"sessionStartTime\":${JSONObject.quote(sessionStartTimeIso)}," +
            "\"totalSeconds\":$totalSecJson,\"dataPoints\":[$dataPointsJson]," +
            "\"teamName\":$tn,\"boatType\":$bt,\"paddlersCount\":$pc}"
    }

    // ── Construcción de JSON de sesión Competencia ───────────────────────────────

    fun buildCompetenciaSessionJsonString(
        sessionStartTimeIso: String,
        points: List<LibreSessionDataPoint>,
    ): String? {
        if (points.isEmpty()) return null
        val totalSeconds = points.maxOfOrNull { it.second } ?: 0L
        val dataPointsJson = points.joinToString(",", transform = ::dataPointToJson)
        val ctx = appContext

        val team = AppPreferences.getTeamDisplayForSession(ctx)
        val teamCountry = AppPreferences.getCachedApiTeamCountry(ctx)
        val boat = AppPreferences.getCompetenciaBoatType(ctx)
        val paddlers = AppPreferences.getCompetenciaPaddlers(ctx)
        val target = AppPreferences.getCompetenciaDistanceMeters(ctx)
        val virada = AppPreferences.getCompetenciaVirada(ctx)
        val drummer = AppPreferences.getCompetenciaDrummer(ctx)
        val age = AppPreferences.getCompetenciaAgeCategory(ctx)
        val teamCat = AppPreferences.getCompetenciaTeamType(ctx)

        return buildString {
            append("{\"sessionKind\":\"competencia\",")
            append("\"sessionStartTime\":").append(JSONObject.quote(sessionStartTimeIso)).append(',')
            append("\"totalSeconds\":").append(jsonSecondsField2(totalSeconds)).append(',')
            append("\"dataPoints\":[").append(dataPointsJson).append("],")
            append("\"teamName\":").append(JSONObject.quote(team)).append(',')
            append("\"teamCountry\":").append(
                if (teamCountry.isNullOrBlank()) "null" else JSONObject.quote(teamCountry)
            ).append(',')
            append("\"boatType\":").append(JSONObject.quote(boat)).append(',')
            append("\"paddlersCount\":").append(paddlers).append(',')
            append("\"targetDistanceMeters\":").append(target).append(',')
            append("\"virada\":").append(if (virada) "true" else "false").append(',')
            append("\"drummer\":").append(if (drummer) "true" else "false").append(',')
            append("\"ageCategory\":").append(JSONObject.quote(age)).append(',')
            append("\"teamCategory\":").append(JSONObject.quote(teamCat))
            append('}')
        }
    }

    // ── Persistencia en filesDir ─────────────────────────────────────────────────

    /**
     * Guarda la sesión Libre en filesDir y dispara upload en segundo plano si el usuario
     * tiene sesión en la nube.
     * Lanza [Exception] si la escritura falla (el llamador decide si ignorarla).
     */
    fun saveLibreSession(
        sessionStartTimeIso: String,
        points: List<LibreSessionDataPoint>,
        onUpload: (String) -> Unit,
    ) {
        if (points.isEmpty()) return
        val totalSeconds = points.maxOfOrNull { it.second } ?: 0L
        val ctx = appContext
        val jsonString = buildLibreSessionJsonString(
            sessionStartTimeIso = sessionStartTimeIso,
            totalSeconds = totalSeconds,
            points = points,
            teamName = AppPreferences.getTeamDisplayForSession(ctx),
            boatType = AppPreferences.getBoatType(ctx),
            paddlersCount = AppPreferences.getPaddlersCount(ctx),
        )
        val fileName = "libre_session_${System.currentTimeMillis()}.json"
        val file = File(ctx.filesDir, fileName)
        file.writeText(jsonString)
        val app = ctx.applicationContext as? MiniDBoatApplication
        if (app != null) {
            onUpload(jsonString)
        }
    }

    /**
     * Guarda el JSON de competencia en filesDir. Devuelve el nombre del archivo creado,
     * o lanza [Exception] si la escritura falla.
     */
    fun saveCompetenciaSession(json: String): String {
        val fileName = "competencia_session_${System.currentTimeMillis()}.json"
        val file = File(appContext.filesDir, fileName)
        file.writeText(json)
        return fileName
    }

    /**
     * Elimina un archivo de sesión en filesDir. Las excepciones se ignoran silenciosamente.
     */
    fun deleteSessionFile(fileName: String) {
        try {
            File(appContext.filesDir, fileName).delete()
        } catch (_: Exception) {
        }
    }
}
