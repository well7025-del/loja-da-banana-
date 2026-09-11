package com.lojadabanana.erp

import android.app.Application
import android.content.Context

class App : Application()

/** Endereço do servidor, guardado no aparelho. */
object Prefs {
    private const val FILE = "loja_da_banana"
    private const val KEY_URL = "server_url"

    fun serverUrl(context: Context): String? =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
            .getString(KEY_URL, null)
            ?.takeIf { it.isNotBlank() }

    fun saveServerUrl(context: Context, url: String) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
            .edit().putString(KEY_URL, url).apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
            .edit().remove(KEY_URL).apply()
    }

    /**
     * Aceita o que a pessoa digitar e devolve uma URL utilizável:
     * "192.168.0.10:3000", "erp.exemplo.com.br", "https://erp.exemplo.com.br/".
     */
    fun normalize(input: String): String? {
        var value = input.trim().removeSuffix("/")
        if (value.isEmpty()) return null
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            // Endereço de rede local costuma ser HTTP; domínio na internet, HTTPS.
            val looksLocal = value.startsWith("192.168.") || value.startsWith("10.") ||
                value.startsWith("172.") || value.startsWith("localhost") || value.contains(":")
            value = (if (looksLocal) "http://" else "https://") + value
        }
        return value
    }
}
