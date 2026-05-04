package com.example.minidboat.util

import android.content.Context
import com.example.minidboat.viewmodel.LibreSessionJson
import com.google.gson.Gson
import java.io.File

object LibreSessionRepository {
    private const val FILE_PREFIX = "libre_session_"
    private const val FILE_SUFFIX = ".json"
    private val gson = Gson()

    fun listSessionFiles(context: Context): List<LibreSessionFileInfo> {
        val filesDir = context.filesDir ?: return emptyList()
        return filesDir.listFiles()
            ?.filter { it.isFile && it.name.startsWith(FILE_PREFIX) && it.name.endsWith(FILE_SUFFIX) }
            ?.sortedByDescending { it.lastModified() }
            ?.map { LibreSessionFileInfo(it.name, it.lastModified(), it) }
            ?: emptyList()
    }

    fun loadSession(file: File): LibreSessionJson? {
        return try {
            gson.fromJson(file.readText(), LibreSessionJson::class.java)
        } catch (_: Exception) {
            null
        }
    }

    fun loadSession(context: Context, fileName: String): LibreSessionJson? {
        val file = File(context.filesDir, fileName)
        return if (file.exists()) loadSession(file) else null
    }

    fun deleteSession(file: File): Boolean {
        return try {
            file.exists() && file.delete()
        } catch (_: Exception) {
            false
        }
    }
}

data class LibreSessionFileInfo(
    val fileName: String,
    val lastModified: Long,
    val file: File
)
