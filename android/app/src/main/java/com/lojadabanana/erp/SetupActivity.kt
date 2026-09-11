package com.lojadabanana.erp

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.lojadabanana.erp.databinding.ActivitySetupBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * Primeira tela: pergunta o endereço do servidor e só salva depois de confirmar
 * que ele responde. Assim o mesmo APK serve para qualquer instalação — rede
 * local da empresa ou domínio na internet.
 */
class SetupActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySetupBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Já configurado? Vai direto para o sistema.
        val saved = Prefs.serverUrl(this)
        if (saved != null && intent.getBooleanExtra(EXTRA_FORCE_SETUP, false).not()) {
            openApp()
            return
        }

        binding = ActivitySetupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.address.setText(saved?.removePrefix("https://")?.removePrefix("http://") ?: "")
        binding.connect.setOnClickListener { attemptConnect() }
    }

    private fun attemptConnect() {
        val url = Prefs.normalize(binding.address.text?.toString().orEmpty())
        if (url == null) {
            binding.error.text = getString(R.string.error_empty)
            binding.error.setShown(true)
            return
        }

        binding.error.setShown(false)
        binding.connect.isEnabled = false
        binding.connect.text = getString(R.string.setup_testing)

        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) { probe(url) }
            binding.connect.isEnabled = true
            binding.connect.text = getString(R.string.setup_connect)

            when (result) {
                Probe.OK -> {
                    Prefs.saveServerUrl(this@SetupActivity, url)
                    openApp()
                }
                Probe.NOT_ERP -> {
                    binding.error.text = getString(R.string.error_not_erp)
                    binding.error.setShown(true)
                }
                Probe.UNREACHABLE -> {
                    binding.error.text = getString(R.string.error_unreachable)
                    binding.error.setShown(true)
                }
            }
        }
    }

    private enum class Probe { OK, NOT_ERP, UNREACHABLE }

    /** Confere se o endereço responde e se é mesmo o ERP. */
    private fun probe(baseUrl: String): Probe = try {
        val connection = (URL("$baseUrl/login").openConnection() as HttpURLConnection).apply {
            connectTimeout = 8000
            readTimeout = 8000
            instanceFollowRedirects = true
            requestMethod = "GET"
        }
        val code = connection.responseCode
        val body = if (code in 200..399) {
            connection.inputStream.bufferedReader().use { it.readText().take(4000) }
        } else ""
        connection.disconnect()

        when {
            code !in 200..399 -> Probe.UNREACHABLE
            body.contains("Loja da Banana") -> Probe.OK
            else -> Probe.NOT_ERP
        }
    } catch (_: Exception) {
        Probe.UNREACHABLE
    }

    private fun openApp() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    companion object {
        const val EXTRA_FORCE_SETUP = "force_setup"
    }
}

private fun android.view.View.setShown(shown: Boolean) {
    visibility = if (shown) android.view.View.VISIBLE else android.view.View.GONE
}
