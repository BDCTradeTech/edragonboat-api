package com.example.minidboat.data

import androidx.core.os.LocaleListCompat

/**
 * Idiomas de la UI alineados con el panel web (`web/src/locale.js` → `UI_LANGUAGES`).
 * Misma clave [code] que `edb_ui_lang` en la web.
 */
data class UiLanguageOption(
    val code: String,
)

val UI_LANGUAGE_OPTIONS: List<UiLanguageOption> = listOf(
    UiLanguageOption("zh"),
    UiLanguageOption("en"),
    UiLanguageOption("fil"),
    UiLanguageOption("fr"),
    UiLanguageOption("de"),
    UiLanguageOption("ja"),
    UiLanguageOption("ms"),
    UiLanguageOption("pt"),
    UiLanguageOption("es"),
).sortedBy { it.code }

private val UI_LANGUAGE_CODES: Set<String> = UI_LANGUAGE_OPTIONS.map { it.code }.toSet()

fun isValidUiLanguageCode(code: String): Boolean = code in UI_LANGUAGE_CODES

/**
 * Tag BCP-47 para [AppCompatDelegate.setApplicationLocales] (coincide con `BCP47` en la web).
 * Sub-etiquetas de región (p. ej. `fil-PH`, `ms-MY`) evitan quedas en locale vacío o no reconocido en el sistema.
 */
fun uiLanguageCodeToLocaleListCompat(code: String): LocaleListCompat {
    val normalized = if (isValidUiLanguageCode(code)) code else DEFAULT_UI_LANGUAGE_CODE
    val tag = when (normalized) {
        "en" -> "en-US"
        "es" -> "es" // hace par con `res/values-es/`
        "zh" -> "zh-Hans-CN"
        "pt" -> "pt-BR"
        "fil" -> "fil-PH"
        "ms" -> "ms-MY"
        "fr" -> "fr-FR"
        "de" -> "de-DE"
        "ja" -> "ja-JP"
        else -> normalized
    }
    return LocaleListCompat.forLanguageTags(tag)
}

/** Valor por defecto: español (como `UI_LANG_DEFAULT` en la web). */
const val DEFAULT_UI_LANGUAGE_CODE = "es"
