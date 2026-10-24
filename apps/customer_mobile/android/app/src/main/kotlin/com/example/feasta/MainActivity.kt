package com.example.feasta

import android.os.Build
import android.os.Bundle
import android.os.Process
import android.os.SystemClock
import android.util.Log
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val activityStart = SystemClock.uptimeMillis()
    private val timingEvents = linkedMapOf<String, Long>()
    private var timingEnabled = false
    private var timingChannel: MethodChannel? = null

    private fun mark(phase: String) {
        val time = SystemClock.uptimeMillis()
        timingEvents[phase] = time
        if (timingEnabled) emit(phase, time)
    }

    private fun emit(phase: String, time: Long) {
        Log.i("FEASTA_STARTUP", "phase=$phase uptimeMs=$time sinceActivityMs=${time - activityStart}")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        mark("activity_on_create")
        super.onCreate(savedInstanceState)
        mark("activity_created")
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        mark("engine_configure_start")
        super.configureFlutterEngine(flutterEngine)
        mark("plugins_registered")
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "feasta/maps_configuration")
            .setMethodCallHandler { call, result ->
                if (call.method == "isConfigured") {
                    @Suppress("DEPRECATION")
                    val info = packageManager.getApplicationInfo(packageName, android.content.pm.PackageManager.GET_META_DATA)
                    val key = info.metaData?.getString("com.google.android.geo.API_KEY")
                    result.success(!key.isNullOrBlank())
                } else result.notImplemented()
            }
        timingChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "feasta/startup_timing")
        timingChannel?.setMethodCallHandler { call, result ->
            if (call.method != "begin") {
                result.notImplemented()
            } else {
                // Dart calls this only with opt-in debug/profile timing enabled.
                timingEnabled = true
                if (Build.VERSION.SDK_INT >= 24) {
                    emit("process_start", Process.getStartUptimeMillis())
                }
                timingEvents.forEach { (phase, time) -> emit(phase, time) }
                mark("dart_clock_observed")
                result.success(SystemClock.uptimeMillis() - activityStart)
            }
        }
    }

    override fun onFlutterUiDisplayed() {
        super.onFlutterUiDisplayed()
        mark("flutter_ui_displayed")
    }

    override fun onDestroy() {
        timingChannel?.setMethodCallHandler(null)
        super.onDestroy()
    }
}
