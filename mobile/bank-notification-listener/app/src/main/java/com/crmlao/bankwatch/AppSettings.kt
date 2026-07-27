package com.crmlao.bankwatch

import android.content.Context
import androidx.work.WorkManager
import java.net.URI

internal data class SettingsSnapshot(
    val serverUrl: String,
    val deviceId: String,
    val deviceSecret: String?,
    val allowedPackages: Set<String>,
) {
    val enrollment: EnrollmentIdentity
        get() = EnrollmentIdentity(serverUrl, deviceId)
}

internal class AppSettings(context: Context) {
    private val applicationContext = context.applicationContext
    private val preferences =
        applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun snapshot(): SettingsSnapshot = synchronized(EnrollmentGuard.lock) {
        SettingsSnapshot(
            serverUrl = preferences.getString(SERVER_URL, "").orEmpty(),
            deviceId = preferences.getString(DEVICE_ID, "").orEmpty(),
            deviceSecret = readSecret(),
            allowedPackages = parsePackages(preferences.getString(ALLOWED_PACKAGES, "").orEmpty()),
        )
    }

    fun hasSecret(): Boolean = synchronized(EnrollmentGuard.lock) {
        preferences.contains(DEVICE_SECRET) && readSecret() != null
    }

    fun save(
        serverUrl: String,
        deviceId: String,
        secret: String?,
        packages: Set<String>,
    ): Boolean = synchronized(EnrollmentGuard.lock) {
        val normalizedServerUrl = normalizeServerUrl(serverUrl)
        val normalizedDeviceId = deviceId.trim()
        val previousEnrollment = EnrollmentIdentity(
            preferences.getString(SERVER_URL, "").orEmpty(),
            preferences.getString(DEVICE_ID, "").orEmpty(),
        )
        val nextEnrollment = EnrollmentIdentity(normalizedServerUrl, normalizedDeviceId)
        val enrollmentChanged = EnrollmentGuard.changed(previousEnrollment, nextEnrollment)
        require(!enrollmentChanged || !secret.isNullOrBlank()) {
            "A new device secret is required when the enrollment changes"
        }

        // Cancel and delete under the same process lock used by enqueue/worker. A worker that
        // already captured the old settings may finish against the old endpoint, but no old
        // queue body can ever be paired with the newly saved enrollment.
        if (enrollmentChanged) {
            WorkManager.getInstance(applicationContext)
                .cancelAllWorkByTag(UploadQueue.WORK_TAG)
            QueueStore(applicationContext).clearAll()
        }

        val editor = preferences.edit()
            .putString(SERVER_URL, normalizedServerUrl)
            .putString(DEVICE_ID, normalizedDeviceId)
            .putString(ALLOWED_PACKAGES, packages.sorted().joinToString("\n"))
        if (!secret.isNullOrBlank()) {
            val encrypted = CryptoStore.encrypt(
                SECRET_ALIAS,
                secret.trim().toByteArray(Charsets.UTF_8),
            )
            editor.putString(DEVICE_SECRET, encrypted)
        }
        check(editor.commit()) { "Unable to persist app settings" }
        enrollmentChanged
    }

    private fun readSecret(): String? = try {
        preferences.getString(DEVICE_SECRET, null)?.let {
            CryptoStore.decrypt(SECRET_ALIAS, it).toString(Charsets.UTF_8)
        }
    } catch (_: Exception) {
        null
    }

    companion object {
        private const val PREFERENCES = "bank_watch_settings"
        private const val SERVER_URL = "server_url"
        private const val DEVICE_ID = "device_id"
        private const val DEVICE_SECRET = "device_secret_encrypted"
        private const val ALLOWED_PACKAGES = "allowed_packages"
        private const val SECRET_ALIAS = "crm_bank_watch_device_secret_v1"
        private val PACKAGE_NAME_PATTERN =
            Regex("^[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)+$")

        fun parsePackages(value: String): Set<String> =
            value.split(',', '\n', '\r', ';')
                .map(String::trim)
                .filter(String::isNotEmpty)
                .toSet()

        fun validatePackages(packages: Set<String>): String? {
            val invalid = packages.firstOrNull { !PACKAGE_NAME_PATTERN.matches(it) }
            return invalid?.let { "ชื่อแพ็กเกจไม่ถูกต้อง: $it" }
        }

        fun normalizeServerUrl(value: String): String = value.trim().trimEnd('/')

        fun validateServerUrl(value: String): String? {
            val uri = try {
                URI(normalizeServerUrl(value))
            } catch (_: Exception) {
                return "Server URL ไม่ถูกต้อง"
            }
            if (uri.host.isNullOrBlank()) return "Server URL ต้องมีชื่อโฮสต์"
            if (uri.rawQuery != null || uri.rawFragment != null) {
                return "Server URL ต้องไม่มี query หรือ fragment"
            }
            if (uri.scheme.equals("https", ignoreCase = true)) return null

            val debugLocal = BuildConfig.DEBUG &&
                uri.scheme.equals("http", ignoreCase = true) &&
                uri.host.lowercase() in setOf("localhost", "127.0.0.1", "10.0.2.2")
            return if (debugLocal) null else "Server URL ต้องใช้ HTTPS"
        }
    }
}
