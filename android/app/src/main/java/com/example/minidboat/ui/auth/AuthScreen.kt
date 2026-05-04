package com.example.minidboat.ui.auth

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.minidboat.BuildConfig
import com.example.minidboat.MiniDBoatApplication
import com.example.minidboat.R
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.SkyPale
import com.example.minidboat.ui.theme.WaveWhite
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.launch
import retrofit2.HttpException

@Composable
fun AuthScreen(
    onLoginSuccess: () -> Unit,
    onGuest: () -> Unit,
    onExit: () -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as MiniDBoatApplication
    val scope = rememberCoroutineScope()

    var email by remember {
        mutableStateOf(AppPreferences.getLoginDraftEmail(context))
    }
    var password by remember {
        mutableStateOf(AppPreferences.getLoginDraftPassword(context))
    }
    var hint by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    val gradient = Brush.verticalGradient(
        colors = listOf(WaveWhite, SkyPale.copy(alpha = 0.65f))
    )
    val hintStyle = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp, lineHeight = 15.sp)
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = OceanDeep,
        unfocusedTextColor = OceanDeep,
        disabledTextColor = OceanDeep.copy(alpha = 0.5f),
        focusedLabelColor = OceanDeep,
        unfocusedLabelColor = OceanDeep.copy(alpha = 0.75f),
        cursorColor = OceanDeep,
        focusedBorderColor = OceanDeep,
        unfocusedBorderColor = OceanDeep.copy(alpha = 0.45f),
        focusedTrailingIconColor = OceanDeep,
        unfocusedTrailingIconColor = OceanDeep,
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(gradient)
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = stringResource(R.string.main_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = OceanDeep,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.auth_intro),
            style = hintStyle,
            color = OceanDeep.copy(alpha = 0.9f),
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(28.dp))

        OutlinedTextField(
            value = email,
            onValueChange = {
                email = it
                AppPreferences.setLoginDraftEmail(context, it)
            },
            label = { Text(stringResource(R.string.auth_email)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors,
        )
        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
            value = password,
            onValueChange = {
                password = it
                AppPreferences.setLoginDraftPassword(context, it)
            },
            label = { Text(stringResource(R.string.auth_password)) },
            singleLine = true,
            visualTransformation = if (passwordVisible) {
                VisualTransformation.None
            } else {
                PasswordVisualTransformation()
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
            colors = fieldColors,
            trailingIcon = {
                val desc = if (passwordVisible) {
                    stringResource(R.string.auth_hide_password)
                } else {
                    stringResource(R.string.auth_show_password)
                }
                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                    Icon(
                        imageVector = if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                        contentDescription = desc,
                        tint = OceanDeep,
                    )
                }
            },
        )
        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = {
                hint = context.getString(R.string.auth_connecting)
                scope.launch {
                    try {
                        val em = email.trim()
                        AppPreferences.setLoginDraftEmail(context, em)
                        AppPreferences.setLoginDraftPassword(context, password)
                        app.cloudRepository.login(em, password)
                        hint = ""
                        onLoginSuccess()
                    } catch (e: HttpException) {
                        hint = mapLoginHttpError(context, e)
                    } catch (e: Exception) {
                        hint = e.message?.takeIf { it.isNotBlank() }
                            ?: context.getString(R.string.auth_login_fail_generic)
                    }
                }
            },
            enabled = email.isNotBlank() && password.length >= 8,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = WaveWhite,
                contentColor = OceanDeep,
                disabledContainerColor = WaveWhite.copy(alpha = 0.6f),
                disabledContentColor = OceanDeep.copy(alpha = 0.45f),
            )
        ) {
            Text(stringResource(R.string.auth_sign_in), color = OceanDeep)
        }

        Spacer(modifier = Modifier.height(8.dp))
        TextButton(onClick = {
            hint = ""
            AppPreferences.clearCloudSession(context)
            AppPreferences.setGuestMode(context, true)
            AppPreferences.setLoginDraftEmail(context, email.trim())
            AppPreferences.setLoginDraftPassword(context, password)
            onGuest()
        }) {
            Text(stringResource(R.string.auth_guest), color = OceanDeep)
        }

        Spacer(modifier = Modifier.height(20.dp))
        TextButton(onClick = onExit) {
            Text(
                text = stringResource(R.string.main_salir),
                style = MaterialTheme.typography.labelLarge,
                color = OceanDeep.copy(alpha = 0.75f),
            )
        }

        if (hint.isNotBlank()) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(hint, style = hintStyle, color = OceanDeep, textAlign = TextAlign.Center)
        }

        Spacer(modifier = Modifier.height(32.dp))
        Text(
            text = stringResource(
                R.string.auth_version,
                BuildConfig.VERSION_NAME,
                BuildConfig.VERSION_CODE,
            ),
            style = hintStyle.copy(fontSize = 11.sp, lineHeight = 14.sp),
            color = OceanDeep.copy(alpha = 0.55f),
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
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
