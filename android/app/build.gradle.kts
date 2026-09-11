plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.lojadabanana.erp"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lojadabanana.erp"
        minSdk = 24          // Android 7.0 — cobre praticamente todo aparelho em uso
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        create("release") {
            // Preenchido pelo GitHub Actions quando os segredos existem.
            val storePath = System.getenv("KEYSTORE_PATH")
            if (!storePath.isNullOrBlank()) {
                storeFile = file(storePath)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Só usa a configuração de assinatura quando o keystore foi fornecido.
            signingConfig = if (System.getenv("KEYSTORE_PATH").isNullOrBlank()) null
                            else signingConfigs.getByName("release")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }

    // Dois aplicativos a partir da mesma base:
    //   servidor — interface para o ERP rodando em um servidor
    //   local    — o ERP inteiro dentro do aparelho, sem servidor
    flavorDimensions += "modo"
    productFlavors {
        create("servidor") {
            dimension = "modo"
            resValue("string", "app_name", "Loja da Banana (rede)")
        }
        create("local") {
            dimension = "modo"
            applicationIdSuffix = ".local"
            versionNameSuffix = "-local"
            resValue("string", "app_name", "Loja da Banana")
        }
    }

    // A interface do modo local é gerada pelo projeto Vite em ../offline
    sourceSets {
        getByName("local") {
            assets.srcDirs("src/local/assets")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")
}
