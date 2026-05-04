package com.example.minidboat.data.cloud

import com.example.minidboat.data.ExerciseType
import com.example.minidboat.data.ExerciseValueType
import com.example.minidboat.data.Routine
import com.example.minidboat.data.RoutineExercise
import kotlin.math.roundToInt

/**
 * Mapea respuestas GET /api/v1/routines (web) al modelo local de la app.
 * kind/metric coinciden con [edragonboat-api] routines.py y el panel web.
 */
internal object RoutineApiMapper {

    fun toRoutine(dto: RoutineReadDto): Routine {
        val sorted = dto.exercises.sortedBy { it.sort_order }
        val exercises = sorted.map { ex ->
            RoutineExercise(
                id = "e${ex.id}",
                type = mapKind(ex.kind),
                valueType = mapMetric(ex.metric),
                value = ex.value.roundToInt().coerceIn(0, 1_000_000_000),
                order = ex.sort_order,
            )
        }
        return Routine(
            id = "w${dto.id}",
            name = dto.name.trim(),
            exercises = exercises,
        )
    }

    private fun mapKind(kind: String): ExerciseType = when (kind.lowercase()) {
        "descanso" -> ExerciseType.DESCANSAR
        "warmup" -> ExerciseType.ENTRADA_EN_CALOR
        "salida" -> ExerciseType.SALIDA
        "r1" -> ExerciseType.R1
        "r2" -> ExerciseType.R2
        "r3" -> ExerciseType.R3
        "r4" -> ExerciseType.R4
        else -> ExerciseType.R1
    }

    private fun mapMetric(metric: String): ExerciseValueType = when (metric.lowercase()) {
        "time" -> ExerciseValueType.TIME
        "distance" -> ExerciseValueType.DISTANCE
        "strokes" -> ExerciseValueType.PALADAS
        else -> ExerciseValueType.TIME
    }
}
