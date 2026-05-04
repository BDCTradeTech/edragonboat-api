package com.example.minidboat.navigation

sealed class AppDestination(val route: String) {
    data object Auth : AppDestination("auth")
    data object Main : AppDestination("main")
    data object Ejercicios : AppDestination("ejercicios")
    data object EjercicioRutina : AppDestination("ejercicio_rutina/{routineId}") {
        fun createRoute(routineId: String) = "ejercicio_rutina/$routineId"
        const val ARG_ROUTINE_ID = "routineId"
    }
    data object Libre : AppDestination("libre")
    data object CompetenciaRun : AppDestination("competencia_run")
    data object Graficos : AppDestination("graficos")
    data object Competencias : AppDestination("competencias")
    data object Config : AppDestination("config")
}
