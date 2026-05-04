package com.example.minidboat.viewmodel

/** Resultado de enviar una competencia al completar (Completado). */
sealed class CompetenciaSubmitOutcome {
    data object Uploaded : CompetenciaSubmitOutcome()
    /** Guardada en el teléfono; queda en cola para reenviar (sin red, error API, etc.). */
    data class SavedPendingUpload(val detail: String) : CompetenciaSubmitOutcome()
    /** No se pudo guardar el archivo local. */
    data class Error(val message: String) : CompetenciaSubmitOutcome()
}
