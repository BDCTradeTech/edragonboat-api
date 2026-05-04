package com.example.minidboat.ui.competencias

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.minidboat.R
import com.example.minidboat.data.AppPreferences
import com.example.minidboat.ui.components.DropdownSelectRow
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.SkyLight
import com.example.minidboat.ui.theme.SkyPale
import com.example.minidboat.ui.theme.WaveWhite

@Composable
private fun competenciaBoatLabel(type: String): String = when (type) {
    AppPreferences.BOAT_TYPE_GRANDE -> stringResource(R.string.boat_grande)
    AppPreferences.BOAT_TYPE_CHICO -> stringResource(R.string.boat_chico)
    else -> stringResource(R.string.boat_grande)
}

@Composable
private fun competenciaAgeLabel(key: String): String = when (key) {
    AppPreferences.COMPETENCIA_AGE_PREMIER -> stringResource(R.string.comp_age_premier)
    AppPreferences.COMPETENCIA_AGE_SENIOR_A -> stringResource(R.string.comp_age_senior_a)
    AppPreferences.COMPETENCIA_AGE_SENIOR_B -> stringResource(R.string.comp_age_senior_b)
    AppPreferences.COMPETENCIA_AGE_SENIOR_C -> stringResource(R.string.comp_age_senior_c)
    else -> stringResource(R.string.comp_age_premier)
}

@Composable
private fun competenciaTeamTypeLabel(key: String): String = when (key) {
    AppPreferences.COMPETENCIA_TEAM_OPEN -> stringResource(R.string.comp_team_open)
    AppPreferences.COMPETENCIA_TEAM_MIXTO -> stringResource(R.string.comp_team_mixed)
    AppPreferences.COMPETENCIA_TEAM_DAMAS -> stringResource(R.string.comp_team_women)
    AppPreferences.COMPETENCIA_TEAM_ACS -> stringResource(R.string.comp_team_acs)
    else -> stringResource(R.string.comp_team_open)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompetenciasScreen(
    onBack: () -> Unit,
    onCompetir: () -> Unit,
) {
    val context = LocalContext.current
    var boatType by remember { mutableStateOf(AppPreferences.getCompetenciaBoatType(context)) }
    var boatExpanded by remember { mutableStateOf(false) }
    var paddlers by remember { mutableStateOf(AppPreferences.getCompetenciaPaddlers(context)) }
    var paddlersExpanded by remember { mutableStateOf(false) }
    var drummer by remember { mutableStateOf(AppPreferences.getCompetenciaDrummer(context)) }
    var drummerExpanded by remember { mutableStateOf(false) }
    var age by remember { mutableStateOf(AppPreferences.getCompetenciaAgeCategory(context)) }
    var ageExpanded by remember { mutableStateOf(false) }
    var teamType by remember { mutableStateOf(AppPreferences.getCompetenciaTeamType(context)) }
    var teamTypeExpanded by remember { mutableStateOf(false) }
    var distanceM by remember { mutableStateOf(AppPreferences.getCompetenciaDistanceMeters(context)) }
    var distanceExpanded by remember { mutableStateOf(false) }
    var virada by remember { mutableStateOf(AppPreferences.getCompetenciaVirada(context)) }
    var viradaExpanded by remember { mutableStateOf(false) }

    val gradientBackground = Brush.verticalGradient(
        colors = listOf(WaveWhite, SkyPale.copy(alpha = 0.6f)),
    )
    val sectionTitle = MaterialTheme.typography.titleSmall.copy(fontSize = 13.sp, lineHeight = 16.sp)
    val hintStyle = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp, lineHeight = 14.sp)

    Scaffold(
        bottomBar = {
            Surface(shadowElevation = 8.dp, tonalElevation = 2.dp) {
                Button(
                    onClick = onCompetir,
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = OceanDeep,
                        contentColor = WaveWhite,
                    ),
                ) {
                    Text(stringResource(R.string.comp_cta), fontWeight = FontWeight.SemiBold)
                }
            }
        },
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.main_competencias),
                        style = MaterialTheme.typography.titleLarge.copy(fontSize = 18.sp),
                        fontWeight = FontWeight.Bold,
                        color = OceanDeep,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = stringResource(R.string.config_back),
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
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                Text(
                    stringResource(R.string.comp_section_boat),
                    style = sectionTitle,
                    fontWeight = FontWeight.SemiBold,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    stringResource(R.string.comp_hint_boat),
                    style = hintStyle,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(4.dp))
                DropdownSelectRow(
                    label = competenciaBoatLabel(boatType),
                    expanded = boatExpanded,
                    onOpen = { boatExpanded = true },
                    onDismiss = { boatExpanded = false },
                ) {
                    AppPreferences.boatTypeOptions.forEach { type ->
                        DropdownMenuItem(
                            text = { Text(competenciaBoatLabel(type), color = Color.Black) },
                            onClick = {
                                boatType = type
                                AppPreferences.setCompetenciaBoatType(context, type)
                                boatExpanded = false
                            },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    stringResource(R.string.comp_section_paddlers),
                    style = sectionTitle,
                    fontWeight = FontWeight.SemiBold,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    stringResource(R.string.comp_hint_paddlers),
                    style = hintStyle,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(4.dp))
                DropdownSelectRow(
                    label = "$paddlers",
                    expanded = paddlersExpanded,
                    onOpen = { paddlersExpanded = true },
                    onDismiss = { paddlersExpanded = false },
                ) {
                    AppPreferences.competenciaPaddlersOptions.forEach { n ->
                        DropdownMenuItem(
                            text = { Text("$n", color = Color.Black) },
                            onClick = {
                                paddlers = n
                                AppPreferences.setCompetenciaPaddlers(context, n)
                                paddlersExpanded = false
                            },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    stringResource(R.string.comp_section_drummer),
                    style = sectionTitle,
                    fontWeight = FontWeight.SemiBold,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    stringResource(R.string.comp_hint_drummer),
                    style = hintStyle,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(4.dp))
                DropdownSelectRow(
                    label = if (drummer) {
                        stringResource(R.string.common_yes)
                    } else {
                        stringResource(R.string.common_no)
                    },
                    expanded = drummerExpanded,
                    onOpen = { drummerExpanded = true },
                    onDismiss = { drummerExpanded = false },
                ) {
                    listOf(false, true).forEach { v ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    if (v) {
                                        stringResource(R.string.common_yes)
                                    } else {
                                        stringResource(R.string.common_no)
                                    },
                                    color = Color.Black,
                                )
                            },
                            onClick = {
                                drummer = v
                                AppPreferences.setCompetenciaDrummer(context, v)
                                drummerExpanded = false
                            },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    stringResource(R.string.comp_section_age),
                    style = sectionTitle,
                    fontWeight = FontWeight.SemiBold,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    stringResource(R.string.comp_hint_age),
                    style = hintStyle,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(4.dp))
                DropdownSelectRow(
                    label = competenciaAgeLabel(age),
                    expanded = ageExpanded,
                    onOpen = { ageExpanded = true },
                    onDismiss = { ageExpanded = false },
                ) {
                    AppPreferences.competenciaAgeOptions.forEach { key ->
                        DropdownMenuItem(
                            text = { Text(competenciaAgeLabel(key), color = Color.Black) },
                            onClick = {
                                age = key
                                AppPreferences.setCompetenciaAgeCategory(context, key)
                                ageExpanded = false
                            },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    stringResource(R.string.comp_section_team),
                    style = sectionTitle,
                    fontWeight = FontWeight.SemiBold,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    stringResource(R.string.comp_hint_team),
                    style = hintStyle,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(4.dp))
                DropdownSelectRow(
                    label = competenciaTeamTypeLabel(teamType),
                    expanded = teamTypeExpanded,
                    onOpen = { teamTypeExpanded = true },
                    onDismiss = { teamTypeExpanded = false },
                ) {
                    AppPreferences.competenciaTeamTypeOptions.forEach { key ->
                        DropdownMenuItem(
                            text = { Text(competenciaTeamTypeLabel(key), color = Color.Black) },
                            onClick = {
                                teamType = key
                                AppPreferences.setCompetenciaTeamType(context, key)
                                teamTypeExpanded = false
                            },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    stringResource(R.string.comp_section_distance),
                    style = sectionTitle,
                    fontWeight = FontWeight.SemiBold,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    stringResource(R.string.comp_hint_distance),
                    style = hintStyle,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(4.dp))
                DropdownSelectRow(
                    label = stringResource(R.string.comp_meters, distanceM),
                    expanded = distanceExpanded,
                    onOpen = { distanceExpanded = true },
                    onDismiss = { distanceExpanded = false },
                ) {
                    AppPreferences.competenciaDistanceOptionsM.forEach { m ->
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.comp_meters, m), color = Color.Black) },
                            onClick = {
                                distanceM = m
                                AppPreferences.setCompetenciaDistanceMeters(context, m)
                                distanceExpanded = false
                            },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    stringResource(R.string.comp_section_turn),
                    style = sectionTitle,
                    fontWeight = FontWeight.SemiBold,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    stringResource(R.string.comp_hint_turn),
                    style = hintStyle,
                    color = OceanDeep,
                )
                Spacer(modifier = Modifier.height(4.dp))
                DropdownSelectRow(
                    label = if (virada) {
                        stringResource(R.string.common_yes)
                    } else {
                        stringResource(R.string.common_no)
                    },
                    expanded = viradaExpanded,
                    onOpen = { viradaExpanded = true },
                    onDismiss = { viradaExpanded = false },
                ) {
                    listOf(false, true).forEach { v ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    if (v) {
                                        stringResource(R.string.common_yes)
                                    } else {
                                        stringResource(R.string.common_no)
                                    },
                                    color = Color.Black,
                                )
                            },
                            onClick = {
                                virada = v
                                AppPreferences.setCompetenciaVirada(context, v)
                                viradaExpanded = false
                            },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}
