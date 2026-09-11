package com.lojadabanana.erp

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.lojadabanana.erp.databinding.ActivityMainBinding

/**
 * Casca nativa do ERP: abre o sistema em tela cheia, trata o botão Voltar,
 * libera a câmera para a leitura de código de barras e mostra uma tela de
 * reconexão quando o servidor está fora do ar.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var serverUrl: String
    private var loadFailed = false
    private var pendingCameraRequest: PermissionRequest? = null
    private var fileChooser: ValueCallback<Array<Uri>>? = null

    private val cameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        pendingCameraRequest?.let { request ->
            if (granted) request.grant(request.resources) else request.deny()
        }
        pendingCameraRequest = null
    }

    private val filePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val data = result.data?.data
        fileChooser?.onReceiveValue(if (data != null) arrayOf(data) else null)
        fileChooser = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val saved = Prefs.serverUrl(this)
        if (saved == null) {
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
            return
        }
        serverUrl = saved

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupWebView()
        binding.refresh.setOnRefreshListener { reload() }
        binding.retry.setOnClickListener { reload() }
        binding.changeAddress.setOnClickListener { openSetup() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.web.canGoBack()) binding.web.goBack() else finish()
            }
        })

        binding.web.loadUrl(serverUrl)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() = with(binding.web) {
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true           // o ERP guarda preferências locais
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false  // câmera do leitor de código
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString LojaDaBananaApp/1.0"
        }

        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?,
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                // Links externos (WhatsApp, telefone) abrem no app próprio do sistema.
                if (!url.startsWith(serverUrl)) {
                    return runCatching {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        true
                    }.getOrDefault(false)
                }
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                binding.refresh.isRefreshing = false
                if (!loadFailed) showContent()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                if (request?.isForMainFrame == true) {
                    loadFailed = true
                    showOffline()
                }
            }
        }

        webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val wantsCamera = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                if (!wantsCamera) {
                    request.deny()
                    return
                }
                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.CAMERA,
                ) == PackageManager.PERMISSION_GRANTED

                if (granted) {
                    request.grant(request.resources)
                } else {
                    pendingCameraRequest = request
                    cameraPermission.launch(Manifest.permission.CAMERA)
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?,
            ): Boolean {
                fileChooser?.onReceiveValue(null)
                fileChooser = callback
                return runCatching {
                    filePicker.launch(params!!.createIntent())
                    true
                }.getOrElse {
                    fileChooser = null
                    false
                }
            }
        }
    }

    private fun reload() {
        loadFailed = false
        showContent()
        binding.web.loadUrl(serverUrl)
    }

    private fun showContent() {
        binding.offline.visibility = View.GONE
        binding.refresh.visibility = View.VISIBLE
    }

    private fun showOffline() {
        binding.refresh.isRefreshing = false
        binding.refresh.visibility = View.GONE
        binding.offline.visibility = View.VISIBLE
    }

    private fun openSetup() {
        AlertDialog.Builder(this)
            .setTitle(R.string.menu_settings)
            .setMessage(serverUrl)
            .setPositiveButton(R.string.change_address) { _, _ ->
                Prefs.clear(this)
                startActivity(
                    Intent(this, SetupActivity::class.java)
                        .putExtra(SetupActivity.EXTRA_FORCE_SETUP, true),
                )
                finish()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }
}
