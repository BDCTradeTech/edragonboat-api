package com.example.minidboat.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.data.cloud.CloudRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed class ConfigUiState {
    data object Idle : ConfigUiState()
    data object Loading : ConfigUiState()
    data class Success(val okCount: Int, val failCount: Int) : ConfigUiState()
    data class Error(val message: String) : ConfigUiState()
}

class ConfigViewModel(
    private val cloudRepository: CloudRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<ConfigUiState>(ConfigUiState.Idle)
    val uiState: StateFlow<ConfigUiState> = _uiState.asStateFlow()

    private val _pendingCompetencias = MutableStateFlow(0)
    val pendingCompetencias: StateFlow<Int> = _pendingCompetencias.asStateFlow()

    fun refreshPendingCount(context: Context) {
        val appContext = context.applicationContext
        AppPreferences.backfillPendingCompetenciaFiles(appContext)
        AppPreferences.claimNoSessionPendingFilesForLoggedInUser(appContext)
        _pendingCompetencias.value = AppPreferences.pendingCompetenciaCount(appContext)
    }

    fun retryPendingUploads(context: Context) {
        val appContext = context.applicationContext

        if (!AppPreferences.isCloudLoggedIn(appContext)) {
            _uiState.value = ConfigUiState.Error("not_logged_in")
            return
        }

        _uiState.value = ConfigUiState.Loading

        viewModelScope.launch {
            val (ok, fail) = withContext(Dispatchers.IO) {
                cloudRepository.retryPendingCompetenciaUploads()
            }
            refreshPendingCount(appContext)
            _uiState.value = ConfigUiState.Success(ok, fail)
        }
    }

    fun resetState() {
        _uiState.value = ConfigUiState.Idle
    }
}

class ConfigViewModelFactory(
    private val cloudRepository: CloudRepository,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ConfigViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return ConfigViewModel(cloudRepository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
