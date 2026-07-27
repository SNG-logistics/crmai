package com.crmlao.bankwatch

import android.content.Context
import java.io.File
import java.util.UUID

internal class QueueStore(context: Context) {
    private val directory = File(context.applicationContext.filesDir, DIRECTORY).apply { mkdirs() }

    fun write(event: NotificationEvent): String {
        cleanupExpired()
        val prefix = event.eventId
            .replace(Regex("[^A-Za-z0-9_-]"), "_")
            .ifBlank { "event" }
            .take(90)
        val safeName = "$prefix-${UUID.randomUUID()}.event"
        val destination = File(directory, safeName)
        val temporary = File(directory, "$safeName.tmp")
        val encrypted = CryptoStore.encrypt(
            QUEUE_ALIAS,
            event.exactJson().toByteArray(Charsets.UTF_8),
        )
        temporary.writeText(encrypted, Charsets.UTF_8)
        val moved = temporary.renameTo(destination)
        if (temporary.exists()) temporary.delete()
        check(moved) {
            "Unable to persist notification event"
        }
        return safeName
    }

    fun read(fileName: String): ByteArray {
        val file = resolve(fileName)
        val encrypted = file.readText(Charsets.UTF_8)
        return CryptoStore.decrypt(QUEUE_ALIAS, encrypted)
    }

    fun delete(fileName: String) {
        resolve(fileName).delete()
    }

    fun clearAll() {
        directory.listFiles()
            ?.filter { it.isFile && (it.name.endsWith(".event") || it.name.endsWith(".tmp")) }
            ?.forEach { it.delete() }
    }

    private fun resolve(fileName: String): File {
        require(fileName.matches(Regex("[A-Za-z0-9_-]{1,160}\\.event"))) {
            "Invalid queue filename"
        }
        return File(directory, fileName)
    }

    private fun cleanupExpired() {
        val cutoff = System.currentTimeMillis() - RETENTION_MILLIS
        directory.listFiles()
            ?.filter { it.isFile && it.lastModified() < cutoff }
            ?.forEach { it.delete() }
    }

    companion object {
        private const val DIRECTORY = "encrypted-notification-queue"
        private const val QUEUE_ALIAS = "crm_bank_watch_queue_v1"
        private const val RETENTION_MILLIS = 7L * 24 * 60 * 60 * 1_000
    }
}
