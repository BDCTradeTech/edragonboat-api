package com.example.minidboat.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.minidboat.ui.theme.OceanDeep
import com.example.minidboat.ui.theme.SkyLight

@Composable
fun DropdownSelectRow(
    label: String,
    expanded: Boolean,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    compact: Boolean = false,
    menuContent: @Composable () -> Unit,
) {
    val hPad = if (compact) 8.dp else 12.dp
    val vPad = if (compact) 5.dp else 10.dp
    val font = if (compact) 12.sp else 14.sp
    val corner = if (compact) 8.dp else 12.dp
    val menuW = if (compact) 0.98f else 0.9f
    Box(modifier = Modifier.fillMaxWidth()) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onOpen),
            shape = RoundedCornerShape(corner),
            color = SkyLight.copy(alpha = 0.5f),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = hPad, vertical = vPad),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = label,
                    maxLines = 1,
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = font),
                    color = OceanDeep,
                )
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = onDismiss,
            containerColor = Color(0xFFE8F4F8),
            modifier = Modifier.fillMaxWidth(menuW),
        ) {
            menuContent()
        }
    }
}
