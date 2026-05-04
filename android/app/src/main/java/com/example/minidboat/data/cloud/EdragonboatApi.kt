package com.example.minidboat.data.cloud

import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

internal data class TokenResponseDto(
    val access_token: String,
    val token_type: String = "bearer",
)

internal data class LibreUploadResponseDto(val id: Int)

internal data class TeamReadDto(
    val id: Int,
    val name: String,
    val country: String? = null,
)

internal data class MyTeamReadDto(
    val team: TeamReadDto,
    val role: String,
)

internal data class RoutineExerciseReadDto(
    val id: Int,
    val sort_order: Int,
    val kind: String,
    val metric: String,
    val value: Double,
)

internal data class RoutineReadDto(
    val id: Int,
    val team_id: Int,
    val name: String,
    val exercises: List<RoutineExerciseReadDto>,
)

internal interface EdragonboatApi {

    @FormUrlEncoded
    @POST("api/v1/auth/login")
    suspend fun login(
        @Field("username") username: String,
        @Field("password") password: String,
    ): TokenResponseDto

    @POST("api/v1/sessions/libre")
    suspend fun uploadLibreSession(@Body body: RequestBody): LibreUploadResponseDto

    @POST("api/v1/sessions/competencia")
    suspend fun uploadCompetenciaSession(@Body body: RequestBody): LibreUploadResponseDto

    @GET("api/v1/teams/me")
    suspend fun getMyTeams(): List<MyTeamReadDto>

    @GET("api/v1/routines")
    suspend fun listRoutines(@Query("team_id") teamId: Int): List<RoutineReadDto>
}
