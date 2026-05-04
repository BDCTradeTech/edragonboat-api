package com.example.minidboat.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.R
import com.example.minidboat.data.Routine
import com.example.minidboat.data.RoutineRepository
import com.example.minidboat.data.cloud.CloudRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class RoutinesViewModel(
    private val repository: RoutineRepository,
    private val cloudRepository: CloudRepository,
) : ViewModel() {

    val routines: StateFlow<List<Routine>> = repository.routines.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList(),
    )

    private val _importBusy = MutableStateFlow(false)
    val importBusy: StateFlow<Boolean> = _importBusy.asStateFlow()

    private val _importToast = MutableStateFlow<String?>(null)
    val importToast: StateFlow<String?> = _importToast.asStateFlow()

    fun consumeImportToast() {
        _importToast.value = null
    }

    /**
     * Descarga rutinas del equipo actual (GET /api/v1/routines) y reemplaza la copia local.
     * Requiere cuenta en la nube (no invitado).
     */
    fun importRoutinesFromCloud(context: Context) {
        val appContext = context.applicationContext
        if (!AppPreferences.isCloudLoggedIn(appContext)) {
            _importToast.value = "Iniciá sesión en Configuración para importar rutinas del equipo."
            return
        }
        if (AppPreferences.isGuestMode(appContext)) {
            _importToast.value = "Salí del modo invitado e iniciá sesión para importar rutinas."
            return
        }
        viewModelScope.launch {
            _importBusy.value = true
            try {
                var teamId = AppPreferences.getCachedApiTeamId(appContext)
                if (teamId < 0) {
                    cloudRepository.refreshCachedTeamFromApi()
                    teamId = AppPreferences.getCachedApiTeamId(appContext)
                }
                if (teamId < 0) {
                    _importToast.value = appContext.getString(R.string.import_no_team)
                    return@launch
                }
                val list = cloudRepository.fetchTeamRoutines(teamId)
                repository.replaceAllRoutines(list)
                _importToast.value = when {
                    list.isEmpty() -> appContext.getString(R.string.import_empty)
                    list.size == 1 -> appContext.getString(R.string.import_one_done)
                    else -> appContext.getString(R.string.import_n_done, list.size)
                }
            } catch (e: Exception) {
                _importToast.value = e.message?.takeIf { it.isNotBlank() }
                    ?: appContext.getString(R.string.import_failed)
            } finally {
                _importBusy.value = false
            }
        }
    }
}
