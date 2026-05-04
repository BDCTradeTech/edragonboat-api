package com.example.minidboat.data

import java.util.UUID

/** Cada ejercicio puede ser por tiempo, distancia o paladas */
enum class ExerciseValueType(val displayName: String, val unit: String) {
    TIME("Tiempo", "seg"),
    DISTANCE("Distancia", "m"),
    PALADAS("Paladas", "pal")
}

/** Tipos de ejercicio disponibles en una rutina */
enum class ExerciseType(val displayName: String) {
    DESCANSAR("Descansar"),
    ENTRADA_EN_CALOR("Entrada en calor"),
    SALIDA("Salida"),
    R1("R1"),
    R2("R2"),
    R3("R3"),
    R4("R4")
}

/** Un ejercicio dentro de una rutina - cada uno tiene su propio tipo (tiempo, distancia o paladas) */
data class RoutineExercise(
    val id: String = UUID.randomUUID().toString(),
    val type: ExerciseType,
    val valueType: ExerciseValueType,
    val value: Int, // segundos si TIME, metros si DISTANCE, paladas si PALADAS
    val order: Int
) {
    val unitLabel: String = valueType.unit
}

/** Rutina completa con sus ejercicios */
data class Routine(
    val id: String,
    val name: String,
    val exercises: List<RoutineExercise>
)
