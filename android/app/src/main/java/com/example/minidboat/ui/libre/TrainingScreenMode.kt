package com.example.minidboat.ui.libre

/**
 * Modo de la pantalla de entrenamiento: [Libre] o [Competencia].
 * Misma lógica en [com.example.minidboat.viewmodel.LibreViewModel]; la UI cambia según el modo.
 */
sealed class TrainingScreenMode {
    data object Libre : TrainingScreenMode()
    data class Competencia(
        val onSubmittedNavigateHome: () -> Unit,
    ) : TrainingScreenMode()
}
