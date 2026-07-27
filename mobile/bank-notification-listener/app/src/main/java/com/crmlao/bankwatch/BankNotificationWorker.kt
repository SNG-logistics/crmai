package com.crmlao.bankwatch

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

internal class BankNotificationWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : Worker(appContext, workerParams) {

    override fun doWork(): Result {
        val queueFile = inputData.getString(INPUT_QUEUE_FILE) ?: return Result.failure()
        val queueStore = QueueStore(applicationContext)
        val queuedRequest = synchronized(EnrollmentGuard.lock) {
            val settings = AppSettings(applicationContext).snapshot()
            val body = try {
                queueStore.read(queueFile)
            } catch (_: Exception) {
                queueStore.delete(queueFile)
                StatusStore(applicationContext)
                    .update("อ่านคิวไม่ได้ — กรุณาทดสอบการเชื่อมต่อใหม่")
                return Result.failure()
            }
            QueuedRequest(settings, body)
        }
        val settings = queuedRequest.settings
        val body = queuedRequest.body
        val secret = settings.deviceSecret
        if (
            settings.deviceId.isBlank() ||
            secret.isNullOrBlank() ||
            AppSettings.validateServerUrl(settings.serverUrl) != null
        ) {
            queueStore.delete(queueFile)
            StatusStore(applicationContext).update("ส่งไม่ได้ — การตั้งค่ายังไม่ครบ")
            return Result.failure()
        }

        val timestamp = (System.currentTimeMillis() / 1_000L).toString()
        val nonce = UUID.randomUUID().toString()
        val signature = sign(secret, timestamp, nonce, body)

        return try {
            val endpoint = "${settings.serverUrl}/api/bank-notifications/ingest"
            val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = 20_000
                doOutput = true
                useCaches = false
                instanceFollowRedirects = false
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("x-bank-device-id", settings.deviceId)
                setRequestProperty("x-bank-timestamp", timestamp)
                setRequestProperty("x-bank-nonce", nonce)
                setRequestProperty("x-bank-signature", signature)
                setFixedLengthStreamingMode(body.size)
            }
            try {
                connection.outputStream.use { it.write(body) }
                val responseCode = connection.responseCode
                when {
                    responseCode in 200..299 -> {
                        QueueStore(applicationContext).delete(queueFile)
                        StatusStore(applicationContext).update("ส่งสำเร็จ (HTTP $responseCode)")
                        Result.success()
                    }
                    responseCode == 408 || responseCode == 429 || responseCode >= 500 -> {
                        StatusStore(applicationContext).update("เซิร์ฟเวอร์ยังไม่พร้อม — จะลองส่งซ้ำ")
                        retryOrStop(queueFile)
                    }
                    else -> {
                        QueueStore(applicationContext).delete(queueFile)
                        StatusStore(applicationContext).update("เซิร์ฟเวอร์ปฏิเสธข้อมูล (HTTP $responseCode)")
                        Result.failure()
                    }
                }
            } finally {
                connection.disconnect()
            }
        } catch (_: IOException) {
            StatusStore(applicationContext).update("เชื่อมต่อไม่ได้ — จะลองส่งซ้ำอัตโนมัติ")
            retryOrStop(queueFile)
        } catch (_: Exception) {
            QueueStore(applicationContext).delete(queueFile)
            StatusStore(applicationContext).update("ส่งข้อมูลไม่สำเร็จ")
            Result.failure()
        }
    }

    private fun retryOrStop(queueFile: String): Result =
        if (runAttemptCount < MAX_RETRY_ATTEMPTS) {
            Result.retry()
        } else {
            QueueStore(applicationContext).delete(queueFile)
            Result.failure()
        }

    private fun sign(secret: String, timestamp: String, nonce: String, body: ByteArray): String {
        val prefix = "$timestamp\n$nonce\n".toByteArray(Charsets.UTF_8)
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        mac.update(prefix)
        return mac.doFinal(body).joinToString("") { byte ->
            "%02x".format(byte.toInt() and 0xff)
        }
    }

    companion object {
        const val INPUT_QUEUE_FILE = "queue_file"
        private const val MAX_RETRY_ATTEMPTS = 12
    }

    private data class QueuedRequest(
        val settings: SettingsSnapshot,
        val body: ByteArray,
    )
}
