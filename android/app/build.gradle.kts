plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
 namespace = "app.careerflow.mobile"
 compileSdk = 34
 defaultConfig { applicationId = "app.careerflow.mobile"; minSdk = 26; targetSdk = 34; versionCode = 1; versionName = "0.1.0-preview" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
}
dependencies { implementation("androidx.work:work-runtime-ktx:2.9.1"); implementation("androidx.webkit:webkit:1.11.0"); testImplementation("junit:junit:4.13.2") }

