package com.lojadabanana.erp

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * Modo LOCAL: o ERP inteiro roda dentro do aparelho.
 *
 * A interface é carregada dos arquivos embutidos no APK e servida por
 * https://appassets.androidplatform.net — uma origem estável, necessária para
 * o banco local (IndexedDB) continuar existindo entre uma abertura e outra.
 *
 * A classe [PonteBackup] é o que a interface usa para gravar e ler o arquivo
 * de backup, já que uma página web sozinha não alcança o sistema de arquivos.
 */
class LocalActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var conteudoPendente: String? = null
    private var pedidoCamera: PermissionRequest? = null

    private val permissaoCamera = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { concedida ->
        pedidoCamera?.let { if (concedida) it.grant(it.resources) else it.deny() }
        pedidoCamera = null
    }

    /** Gravar o backup onde a pessoa escolher (inclusive no Drive). */
    private val criarArquivo = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { destino ->
        val conteudo = conteudoPendente
        conteudoPendente = null

        if (destino == null || conteudo == null) {
            responderSalvamento(false, "Você cancelou antes de escolher onde salvar.")
            return@registerForActivityResult
        }
        try {
            contentResolver.openOutputStream(destino)?.use { it.write(conteudo.toByteArray()) }
                ?: throw IllegalStateException("destino inacessível")
            responderSalvamento(true, "Backup salvo com sucesso.")
        } catch (e: Exception) {
            responderSalvamento(false, "Não foi possível gravar o arquivo: ${e.message}")
        }
    }

    /** Escolher um arquivo de backup para restaurar. */
    private val abrirArquivo = registerForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { origem ->
        if (origem == null) {
            responderArquivo(null, "Nenhum arquivo escolhido.")
            return@registerForActivityResult
        }
        try {
            val texto = contentResolver.openInputStream(origem)
                ?.bufferedReader()?.use { it.readText() }
                ?: throw IllegalStateException("arquivo ilegível")
            responderArquivo(texto, null)
        } catch (e: Exception) {
            responderArquivo(null, "Não foi possível ler o arquivo: ${e.message}")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true       // o banco local depende disso
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val url = request.url.toString()
                if (url.startsWith(BASE)) return false
                // Links externos (WhatsApp, telefone) abrem no app próprio.
                return runCatching {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    true
                }.getOrDefault(false)
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                // Só a página principal: um ícone que falta não vira tela de erro.
                if (!request.isForMainFrame) return
                mostrarFalha(
                    "Não foi possível abrir a tela do sistema.",
                    "${error.description} (código ${error.errorCode})",
                )
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                if (!request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                    request.deny()
                    return
                }
                val jaTem = ContextCompat.checkSelfPermission(
                    this@LocalActivity, Manifest.permission.CAMERA,
                ) == PackageManager.PERMISSION_GRANTED

                if (jaTem) request.grant(request.resources)
                else {
                    pedidoCamera = request
                    permissaoCamera.launch(Manifest.permission.CAMERA)
                }
            }
        }

        web.addJavascriptInterface(PonteBackup(), "AndroidBackup")

        // Se o APK foi montado sem a interface, a tela ficaria branca para sempre
        // e pareceria que o aplicativo não abre. Melhor dizer o que aconteceu.
        if (!interfaceEmbutida()) {
            mostrarFalha(
                "Este instalador veio incompleto.",
                "A interface do sistema não está dentro do aplicativo. " +
                    "Gere o APK novamente pelo GitHub Actions e instale o arquivo " +
                    "cujo nome contém LOCAL.",
            )
            return
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        web.loadUrl("$BASE/index.html")
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /** Métodos que a interface chama. Tudo roda em thread separada do WebView. */
    private inner class PonteBackup {

        @JavascriptInterface
        fun salvarBackup(nomeArquivo: String, conteudo: String) {
            conteudoPendente = conteudo
            runOnUiThread {
                runCatching { criarArquivo.launch(nomeArquivo) }
                    .onFailure {
                        conteudoPendente = null
                        responderSalvamento(false, "Não foi possível abrir o seletor de pastas.")
                    }
            }
        }

        @JavascriptInterface
        fun compartilharBackup(nomeArquivo: String, conteudo: String): String = try {
            val pasta = File(cacheDir, "backups").apply { mkdirs() }
            // Só o backup mais recente fica no cache.
            pasta.listFiles()?.forEach { it.delete() }
            val arquivo = File(pasta, nomeArquivo).apply { writeText(conteudo) }

            val uri: Uri = FileProvider.getUriForFile(
                this@LocalActivity, "$packageName.arquivos", arquivo,
            )
            val envio = Intent(Intent.ACTION_SEND).apply {
                type = "application/json"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, nomeArquivo)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            runOnUiThread {
                startActivity(Intent.createChooser(envio, "Salvar backup em"))
            }
            "OK"
        } catch (e: Exception) {
            "ERRO: ${e.message}"
        }

        @JavascriptInterface
        fun escolherArquivo() {
            runOnUiThread {
                runCatching { abrirArquivo.launch(arrayOf("application/json", "text/plain", "*/*")) }
                    .onFailure { responderArquivo(null, "Não foi possível abrir o seletor de arquivos.") }
            }
        }

        @JavascriptInterface
        fun versaoApp(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun recarregar() = runOnUiThread { web.loadUrl("$BASE/index.html") }
    }

    /** Página legível no lugar da tela branca, com o motivo da falha. */
    private fun mostrarFalha(titulo: String, detalhe: String) {
        val html = """
            <!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <style>
              body{margin:0;padding:32px 24px;font:16px/1.5 system-ui,sans-serif;
                   color:#1c1917;background:#faf9f7}
              h1{font-size:20px;margin:0 0 12px}
              p{margin:0 0 20px;color:#57534e}
              code{display:block;background:#f0eeea;padding:12px;border-radius:8px;
                   font-size:13px;color:#44403c;word-break:break-word}
              button{margin-top:24px;width:100%;padding:14px;border:0;border-radius:10px;
                     background:#15803d;color:#fff;font-size:16px;font-weight:600}
            </style></head><body>
              <h1>TITULO</h1>
              <p>DETALHE</p>
              <code>Versão VERSAO</code>
              <button onclick="AndroidBackup.recarregar()">Tentar de novo</button>
            </body></html>
        """.trimIndent()
            .replace("TITULO", titulo.escaparHtml())
            .replace("DETALHE", detalhe.escaparHtml())
            .replace("VERSAO", BuildConfig.VERSION_NAME.escaparHtml())

        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }

    private fun responderSalvamento(ok: Boolean, mensagem: String) = runOnUiThread {
        web.evaluateJavascript(
            "window.__lojaDaBananaBackupSalvo && " +
                "window.__lojaDaBananaBackupSalvo($ok, ${mensagem.comoLiteralJs()});",
            null,
        )
    }

    private fun responderArquivo(conteudo: String?, erro: String?) = runOnUiThread {
        val primeiro = conteudo?.comoLiteralJs() ?: "null"
        val segundo = erro?.comoLiteralJs() ?: "undefined"
        web.evaluateJavascript(
            "window.__lojaDaBananaArquivoEscolhido && " +
                "window.__lojaDaBananaArquivoEscolhido($primeiro, $segundo);",
            null,
        )
    }

    companion object {
        private const val BASE = "https://appassets.androidplatform.net"
    }
}

/** Conferir se o APK traz a interface embutida. */
private fun LocalActivity.interfaceEmbutida(): Boolean =
    runCatching { assets.list("")?.contains("index.html") == true }.getOrDefault(false)

/** Texto seguro para ir dentro de uma página HTML. */
private fun String.escaparHtml(): String = this
    .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

/** Texto pronto para ser embutido em JavaScript, sem quebrar com aspas. */
private fun String.comoLiteralJs(): String {
    val saida = StringBuilder("\"")
    for (c in this) {
        when {
            c == '\\' -> saida.append("\\\\")
            c == '"' -> saida.append("\\\"")
            c == '\n' -> saida.append("\\n")
            c == '\r' -> saida.append("\\r")
            c == '\t' -> saida.append("\\t")
            // U+2028 e U+2029 quebram o parser de JavaScript
            c.code == 0x2028 || c.code == 0x2029 || c < ' ' ->
                saida.append("\\u%04x".format(c.code))
            else -> saida.append(c)
        }
    }
    return saida.append("\"").toString()
}
