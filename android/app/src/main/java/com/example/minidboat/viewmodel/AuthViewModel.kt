package com.example.minidboat.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.minidboat.R
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.data.cloud.CloudRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

sealed class AuthUiState {
    data object Idle : AuthUiState()
    data object Loading : AuthUiState()
    data object Success : AuthUiState()
    data class Error(val message: String) : AuthUiState()
}

class AuthViewModel(
    private val cloudRepository: CloudRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    fun login(context: Context, email: String, password: String) {
        val appContext = context.applicationContext
        val trimmedEmail = email.trim()
        AppPreferences.setLoginDraftEmail(appContext, trimmedEmail)
        AppPreferences.setLoginDraftPassword(appContext, password)
        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            try {
                cloudRepository.login(trimmedEmail, password)
                _uiState.value = AuthUiState.Success
            } catch (e: HttpException) {
                _uiState.value = AuthUiState.Error(mapLoginHttpError(appContext, e))
            } catch (e: Exception) {
                _uiState.value = AuthUiState.Error(
                    e.message?.takeIf { it.isNotBlank() }
                        ?: appContext.getString(R.string.auth_login_fail_generic)
                )
            }
        }
    }

    /** Resetea el estado a Idle (p. ej. al volver de una navegación exitosa). */
    fun resetState() {
        _uiState.value = AuthUiState.Idle
    }
}

class AuthViewModelFactory(
    private val cloudRepository: CloudRepository,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(AuthViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return AuthViewModel(cloudRepository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}

private fun mapLoginHttpError(context: Context, e: HttpException): String {
    val code = e.code()
    val body = e.response()?.errorBody()?.string().orEmpty()
    val b = body.lowercase()
    val notRegistered =
        "not registered" in b || "no registr" in b || "no existe" in b ||
            "unknown user" in b || "user not found" in b || "no user" in b ||
            "usuario no" in b || "sin cuenta" in b
    val gen = context.getString(R.string.auth_login_fail_generic)
    return when (code) {
        401, 403, 404 -> {
            if (notRegistered) {
                context.getString(R.string.auth_error_not_registered)
            } else {
                context.getString(R.string.auth_error_wrong_or_unknown)
            }
        }
        else -> body.trim().ifBlank { e.message() ?: gen }
    }
}
