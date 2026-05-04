package com.example.minidboat.navigation

import com.example.minidboat.data.Routine

sealed class AppScreen {
    data object Main : AppScreen()
    data object Ejercicios : AppScreen()
    data class EjercicioRutina(val routine: Routine) : AppScreen()
    data object Libre : AppScreen()
    data object Graficos : AppScreen()
    data object Competencias : AppScreen()
    data object CompetenciaRun : AppScreen()
    data object Config : AppScreen()
}
