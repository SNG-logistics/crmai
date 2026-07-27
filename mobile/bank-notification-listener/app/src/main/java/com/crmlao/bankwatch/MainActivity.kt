package com.crmlao.bankwatch

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.crmlao.bankwatch.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var appSettings: AppSettings

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE,
        )
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        appSettings = AppSettings(this)

        loadSettings()
        binding.saveButton.setOnClickListener { saveSettings(showConfirmation = true) }
        binding.testButton.setOnClickListener { runConnectionTest() }
        binding.openAccessButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun loadSettings() {
        val snapshot = appSettings.snapshot()
        binding.serverUrlInput.setText(snapshot.serverUrl)
        binding.deviceIdInput.setText(snapshot.deviceId)
        binding.allowlistInput.setText(snapshot.allowedPackages.sorted().joinToString("\n"))
        binding.deviceSecretInput.hint = if (appSettings.hasSecret()) {
            getString(R.string.device_secret_hint_saved)
        } else {
            getString(R.string.device_secret_hint_new)
        }
        refreshStatus()
    }

    private fun saveSettings(showConfirmation: Boolean): Boolean {
        val serverUrl = binding.serverUrlInput.text.toString()
        val deviceId = binding.deviceIdInput.text.toString().trim()
        val secret = binding.deviceSecretInput.text.toString().trim().takeIf(String::isNotEmpty)
        val packages = AppSettings.parsePackages(binding.allowlistInput.text.toString())
        val currentEnrollment = appSettings.snapshot().enrollment
        val nextEnrollment = EnrollmentIdentity(
            AppSettings.normalizeServerUrl(serverUrl),
            deviceId,
        )
        val enrollmentChanged = EnrollmentGuard.changed(currentEnrollment, nextEnrollment)

        AppSettings.validateServerUrl(serverUrl)?.let {
            binding.serverUrlInput.error = it
            return false
        }
        if (deviceId.isBlank()) {
            binding.deviceIdInput.error = "กรุณากรอก Device public ID"
            return false
        }
        if (secret == null && (!appSettings.hasSecret() || enrollmentChanged)) {
            binding.deviceSecretInput.error = if (enrollmentChanged) {
                "เมื่อเปลี่ยน Server URL หรือ Device ID ต้องกรอก Device secret ใหม่"
            } else {
                "กรุณากรอก Device secret"
            }
            return false
        }
        AppSettings.validatePackages(packages)?.let {
            binding.allowlistInput.error = it
            return false
        }

        return try {
            val enrollmentChanged = appSettings.save(serverUrl, deviceId, secret, packages)
            binding.deviceSecretInput.text?.clear()
            binding.deviceSecretInput.hint = getString(R.string.device_secret_hint_saved)
            if (showConfirmation) {
                val message = if (enrollmentChanged) {
                    "บันทึก enrollment ใหม่และล้างคิวเดิมแล้ว"
                } else if (packages.isEmpty()) {
                    "บันทึกแล้ว แต่ยังไม่รับแจ้งเตือนจนกว่าจะเพิ่มแพ็กเกจธนาคาร"
                } else {
                    "บันทึกการตั้งค่าแล้ว"
                }
                Toast.makeText(this, message, Toast.LENGTH_LONG).show()
            }
            true
        } catch (_: Exception) {
            Toast.makeText(this, "บันทึก secret ใน Keystore ไม่สำเร็จ", Toast.LENGTH_LONG).show()
            false
        }
    }

    private fun runConnectionTest() {
        if (!saveSettings(showConfirmation = false)) return
        val enrollment = appSettings.snapshot().enrollment
        val requestId = UploadQueue.enqueue(this, NotificationEvent.test(this), enrollment)
        if (requestId == null) {
            refreshStatus()
            return
        }

        StatusStore(this).update("จัดคิวทดสอบแล้ว")
        refreshStatus()
        binding.testButton.isEnabled = false
        WorkManager.getInstance(this).getWorkInfoByIdLiveData(requestId).observe(this) { info ->
            if (info == null) return@observe
            refreshStatus()
            if (info.state.isFinished || info.state == WorkInfo.State.ENQUEUED) {
                binding.testButton.isEnabled = true
            }
        }
    }

    private fun refreshStatus() {
        val hasAccess = packageName in
            NotificationManagerCompat.getEnabledListenerPackages(this)
        val accessStatus = if (hasAccess) {
            getString(R.string.status_access_enabled)
        } else {
            getString(R.string.status_access_disabled)
        }
        binding.statusText.text = getString(
            R.string.status_format,
            accessStatus,
            StatusStore(this).display(),
        )
    }
}
