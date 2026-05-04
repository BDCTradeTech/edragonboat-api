package com.example.minidboat.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.minidboat.R
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.SkyLight

@Composable
fun CountdownOverlay(
    secondsRemaining: Int
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f)),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = SkyLight.copy(alpha = 0.95f)
        ) {
            Column(
                modifier = Modifier.padding(48.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(R.string.countdown_ready),
                    style = MaterialTheme.typography.titleLarge,
                    color = OceanDeep
                )
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = if (secondsRemaining == 0) {
                        stringResource(R.string.countdown_go)
                    } else {
                        "$secondsRemaining"
                    },
                    style = MaterialTheme.typography.displayLarge,
                    fontSize = 120.sp,
                    fontWeight = FontWeight.Bold,
                    color = OceanDeep
                )
            }
        }
    }
}
