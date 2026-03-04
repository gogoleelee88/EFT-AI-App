plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val generatedVersionCode = (System.getenv("APP_VERSION_CODE")?.toIntOrNull()
    ?: (System.currentTimeMillis() / 1000).toInt())
val generatedVersionName = System.getenv("APP_VERSION_NAME")
    ?: "1.0.${generatedVersionCode}"

android {
    namespace = "com.eft.mobileagent"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.eft.mobileagent"
        minSdk = 26
        targetSdk = 35
        versionCode = generatedVersionCode
        versionName = generatedVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "BACKEND_BASE_URL", "\"https://eft-ai-app.onrender.com\"")
        buildConfigField("String", "COMPLETION_EVENT_PATH", "\"/api/push/metrics\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.navigation:navigation-fragment-ktx:2.8.9")
    implementation("androidx.navigation:navigation-ui-ktx:2.8.9")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("org.tensorflow:tensorflow-lite:2.14.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    implementation("com.google.zxing:core:3.5.3")
}
