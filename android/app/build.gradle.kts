plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
 namespace = "app.careerflow.mobile"
 compileSdk = 34
 defaultConfig { applicationId = "app.careerflow.mobile"; testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"; minSdk = 26; targetSdk = 34; versionCode = 5; versionName = "0.4.0" }
 val localKeystore = System.getenv("CAREERFLOW_KEYSTORE_PATH")
 if (!localKeystore.isNullOrBlank()) {
  signingConfigs { create("localRelease") { storeFile = file(localKeystore); storePassword = System.getenv("CAREERFLOW_STORE_PASSWORD"); keyAlias = "careerflow"; keyPassword = System.getenv("CAREERFLOW_STORE_PASSWORD") } }
  buildTypes { getByName("release") { signingConfig = signingConfigs.getByName("localRelease"); isDebuggable = false } }
 }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 packaging { resources { merges += setOf("META-INF/LICENSE.md", "META-INF/NOTICE.md", "META-INF/LICENSE", "META-INF/NOTICE") } }
 kotlinOptions { jvmTarget = "17" }
}
dependencies { androidTestImplementation("androidx.test.ext:junit:1.1.5"); androidTestImplementation("androidx.test:runner:1.5.2"); implementation("com.sun.mail:android-mail:1.6.7"); implementation("com.sun.mail:android-activation:1.6.7"); implementation("com.tom-roush:pdfbox-android:2.0.27.0"); implementation("androidx.work:work-runtime-ktx:2.9.1"); implementation("androidx.webkit:webkit:1.11.0"); testImplementation("junit:junit:4.13.2") }

