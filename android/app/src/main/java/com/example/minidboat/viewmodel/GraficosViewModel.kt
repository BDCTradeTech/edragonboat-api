package com.example.minidboat.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.minidboat.util.LibreSessionFileInfo
import com.example.minidboat.util.LibreSessionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class GraficosState(
    val files: List<LibreSessionFileInfo> = emptyList(),
    val selectedFile: LibreSessionFileInfo? = null,
    val selectedSession: LibreSessionJson? = null,
    val loading: Boolean = false
)

class GraficosViewModel(
    private val context: Context
) : ViewModel() {

    private val _state = MutableStateFlow(GraficosState())
    val state: StateFlow<GraficosState> = _state.asStateFlow()

    init {
        loadFiles()
    }

    fun loadFiles() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            val files = LibreSessionRepository.listSessionFiles(context)
            _state.update {
                val keptFile =
                    if (it.selectedFile != null && files.any { f -> f.fileName == it.selectedFile!!.fileName }) {
                        it.selectedFile
                    } else {
                        null
                    }
                val sessionForSelection = keptFile?.let { info ->
                    LibreSessionRepository.loadSession(info.file)
                }
                it.copy(
                    files = files,
                    selectedFile = keptFile,
                    selectedSession = sessionForSelection,
                    loading = false
                )
            }
        }
    }

    fun selectFile(info: LibreSessionFileInfo) {
        viewModelScope.launch {
            val session = LibreSessionRepository.loadSession(info.file)
            _state.update {
                it.copy(
                    selectedFile = info,
                    selectedSession = session
                )
            }
        }
    }

    fun clearSelection() {
        _state.update {
            it.copy(selectedFile = null, selectedSession = null)
        }
    }

    fun deleteFile(info: LibreSessionFileInfo) {
        viewModelScope.launch {
            val wasSelected = _state.value.selectedFile?.fileName == info.fileName
            LibreSessionRepository.deleteSession(info.file)
            val newFiles = LibreSessionRepository.listSessionFiles(context)
            if (wasSelected) {
                _state.update {
                    it.copy(files = newFiles, selectedFile = null, selectedSession = null)
                }
            } else {
                _state.update { it.copy(files = newFiles) }
            }
        }
    }

    fun deleteAllFiles() {
        viewModelScope.launch {
            _state.value.files.forEach { LibreSessionRepository.deleteSession(it.file) }
            val newFiles = LibreSessionRepository.listSessionFiles(context)
            _state.update {
                it.copy(files = newFiles, selectedFile = null, selectedSession = null)
            }
        }
    }

    class Factory(private val context: Context) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return GraficosViewModel(context.applicationContext) as T
        }
    }
}
