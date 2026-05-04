package com.example.minidboat.util

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

private val symbols = DecimalFormatSymbols(Locale("es", "ES")).apply {
    groupingSeparator = '.'
    decimalSeparator = ','
}

/** Formatea número entero con punto de miles: 1234 → "1.234" */
fun formatWithThousands(value: Long): String =
    DecimalFormat("#,###", symbols).format(value)

/** Formatea número entero con punto de miles */
fun formatWithThousands(value: Int): String =
    DecimalFormat("#,###", symbols).format(value)

/** Formatea número float con punto de miles y 2 decimales: 1234.5 → "1.234,50" */
fun formatWithThousandsTwoDecimals(value: Float): String =
    DecimalFormat("#,##0.00", symbols).format(value.toDouble())

/** Un decimal en pantalla (velocidad, DPS en vivo); el JSON se guarda con 2 decimales aparte. */
fun formatWithThousandsOneDecimal(value: Float): String =
    DecimalFormat("#,##0.0", symbols).format(value.toDouble())

/** Convierte segundos a formato hh:mm:ss */
fun formatTimeHhMmSs(totalSeconds: Long): String {
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return String.format("%02d:%02d:%02d", hours, minutes, seconds)
}
