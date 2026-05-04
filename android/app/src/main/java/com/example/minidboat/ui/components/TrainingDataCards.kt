package com.example.minidboat.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.minidboat.R
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.OceanMid
import com.example.minidboat.ui.theme.SkyLight
import com.example.minidboat.util.formatWithThousands
import com.example.minidboat.util.formatWithThousandsOneDecimal
import com.example.minidboat.viewmodel.LibreState

/** Rojo para métricas dinámicas (velocidad, SPM). */
val TrainingMetricsAccentRed = Color(0xFFC62828)

/** Azul para DPS en todas las pantallas de entrenamiento. */
val TrainingMetricsDpsBlue = OceanMid

/**
 * Grilla 3×2 de métricas en vivo: Tiempo/Velocidad, DPS/SPM, Distancia/Paladas.
 * Usada en Libre y en rutina para la misma presentación visual.
 */
@Composable
fun TrainingDataCards(
    modifier: Modifier = Modifier,
    state: LibreState,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            TrainingDataCard(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.train_time),
                number = formatWithThousands(state.elapsedSeconds),
                unit = stringResource(R.string.train_unit_sec)
            )
            TrainingDataCard(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.train_speed),
                number = formatWithThousandsOneDecimal(state.speedKmh),
                unit = stringResource(R.string.train_unit_kmh),
                valueColor = TrainingMetricsAccentRed
            )
        }
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            TrainingDataCard(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.train_dps),
                number = formatWithThousandsOneDecimal(state.dpsMeters),
                unit = stringResource(R.string.train_unit_m),
                valueColor = TrainingMetricsDpsBlue
            )
            TrainingDataCard(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.train_spm),
                number = formatWithThousands(state.spm),
                unit = null,
                valueColor = TrainingMetricsAccentRed
            )
        }
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            val distM = state.distanceMeters
            val distanceValueSp = when {
                distM >= 10_000f -> 50f
                distM >= 1_000f -> 60f
                else -> TrainingValueFontSizeSp
            }
            TrainingDataCard(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.train_distance),
                number = formatWithThousands(state.distanceMeters.toLong()),
                unit = stringResource(R.string.train_unit_m),
                valueFontSizeSp = distanceValueSp,
                valueSingleLine = true,
            )
            TrainingDataCard(
                modifier = Modifier.weight(1f),
                label = stringResource(R.string.train_strokes),
                number = formatWithThousands(state.paladas),
                unit = null
            )
        }
    }
}

private const val TrainingValueFontSizeSp = 76f
private const val TrainingUnitFontSizeSp = 17f

@Composable
fun TrainingDataCard(
    modifier: Modifier = Modifier,
    label: String,
    number: String,
    unit: String?,
    valueColor: Color = OceanDeep,
    valueFontSizeSp: Float = TrainingValueFontSizeSp,
    /** Una sola línea (p. ej. distancia con miles) para no partir el número en el separador de miles. */
    valueSingleLine: Boolean = false,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = SkyLight.copy(alpha = 0.4f)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = OceanDeep
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = number,
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.displayLarge,
                fontSize = valueFontSizeSp.sp,
                fontWeight = FontWeight.Bold,
                color = valueColor,
                lineHeight = valueFontSizeSp.sp,
                maxLines = if (valueSingleLine) 1 else Int.MAX_VALUE,
                softWrap = !valueSingleLine,
                textAlign = TextAlign.Center,
            )
            if (unit != null) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = unit,
                    fontSize = TrainingUnitFontSizeSp.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = valueColor
                )
            }
        }
    }
}
