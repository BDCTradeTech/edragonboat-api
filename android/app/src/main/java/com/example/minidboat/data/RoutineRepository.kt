package com.example.minidboat.data

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

class RoutineRepository(context: Context) {
    private val gson = Gson()
    private val type = object : TypeToken<List<Routine>>() {}.type

    private val _routines = MutableStateFlow(loadRoutines())
    val routines: Flow<List<Routine>> = _routines.asStateFlow()

    private fun loadRoutines(): List<Routine> {
        val json = AppSecurePreferences.getString(KEY_ROUTINES, "[]") ?: "[]"
        return try {
            gson.fromJson<List<Routine>>(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun saveRoutines(list: List<Routine>) {
        AppSecurePreferences.putString(KEY_ROUTINES, gson.toJson(list))
        _routines.value = list
    }

    /** Sustituye la lista local (p. ej. tras importar desde la web). */
    suspend fun replaceAllRoutines(routines: List<Routine>) = withContext(Dispatchers.IO) {
        saveRoutines(routines)
    }

    companion object {
        private const val KEY_ROUTINES = "routines"
    }
}
