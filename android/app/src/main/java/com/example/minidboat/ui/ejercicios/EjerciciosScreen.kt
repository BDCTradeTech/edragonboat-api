package com.example.minidboat.ui.ejercicios

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.minidboat.R
import com.example.minidboat.data.Routine
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.SkyBlue
import com.example.minidboat.ui.theme.SkyLight
import com.example.minidboat.ui.theme.SkyPale
import com.example.minidboat.ui.theme.WaveWhite

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EjerciciosScreen(
    routines: List<Routine>,
    importBusy: Boolean,
    canImportFromCloud: Boolean,
    onImportFromCloud: () -> Unit,
    onBack: () -> Unit,
    onRoutineSelected: (Routine) -> Unit,
) {
    val gradientBackground = Brush.verticalGradient(
        colors = listOf(WaveWhite, SkyPale.copy(alpha = 0.6f)),
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.main_ejercicios),
                        fontWeight = FontWeight.Bold,
                        color = OceanDeep,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = stringResource(R.string.ej_back_to_main),
                            tint = OceanDeep,
                        )
                    }
                },
                colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(
                    containerColor = SkyLight.copy(alpha = 0.9f),
                    titleContentColor = OceanDeep,
                ),
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(gradientBackground)
                .padding(padding),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            ) {
                Text(
                    text = stringResource(R.string.ej_team_routines),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = when {
                        canImportFromCloud -> stringResource(R.string.ej_help_can_import)
                        else -> stringResource(R.string.ej_help_no_import)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = SkyBlue,
                )
                Spacer(modifier = Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Button(
                        onClick = onImportFromCloud,
                        enabled = canImportFromCloud && !importBusy,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = OceanDeep,
                            contentColor = WaveWhite,
                        ),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            if (importBusy) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = WaveWhite,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                            }
                            Text(stringResource(R.string.ej_import_from_web))
                        }
                    }
                }
                Spacer(modifier = Modifier.height(20.dp))

                if (routines.isEmpty()) {
                    Text(
                        text = stringResource(R.string.ej_empty_phone),
                        style = MaterialTheme.typography.bodyLarge,
                        color = OceanDeep,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.ej_empty_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = SkyBlue,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    Text(
                        text = stringResource(R.string.ej_select_routine),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = OceanDeep,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                    routines.forEach { routine ->
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp)
                                .clickable { onRoutineSelected(routine) },
                            shape = RoundedCornerShape(16.dp),
                            color = SkyLight.copy(alpha = 0.4f),
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.fillMaxWidth()) {
                                    Text(
                                        text = routine.name,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = OceanDeep,
                                    )
                                    Text(
                                        text = stringResource(
                                            R.string.ej_exercises_n,
                                            routine.exercises.size,
                                        ),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = SkyBlue,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
