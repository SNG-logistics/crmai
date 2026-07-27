package com.crmlao.bankwatch

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.service.notification.StatusBarNotification
import java.security.MessageDigest
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

internal data class ParsedTransaction(
    val direction: String,
    val amount: String?,
    val currency: String?,
    val transactionRef: String?,
    val accountSuffix: String?,
    val sender: String?,
    val bankHint: String?,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("direction", direction)
        .put("amount", amount?.toBigDecimalOrNull() ?: JSONObject.NULL)
        .put("currency", currency ?: JSONObject.NULL)
        .put("transactionRef", transactionRef ?: JSONObject.NULL)
        .put("accountSuffix", accountSuffix ?: JSONObject.NULL)
        .put("sender", sender ?: JSONObject.NULL)
        .put("bankHint", bankHint ?: JSONObject.NULL)
}

internal data class NotificationEvent(
    val eventId: String,
    val packageName: String,
    val notificationKey: String,
    val postedAt: String,
    val capturedAt: String,
    val title: String?,
    val text: String?,
    val bigText: String?,
    val textLines: List<String>,
    val parsed: ParsedTransaction,
    val test: Boolean,
    val signerSha256: String?,
    val appVersion: String?,
) {
    fun exactJson(): String = JSONObject()
        .put("eventId", eventId)
        .put("packageName", packageName)
        .put("notificationKey", notificationKey)
        .put("postedAt", postedAt)
        .put("capturedAt", capturedAt)
        .put("title", title.orEmpty())
        .put("text", text.orEmpty())
        .put("bigText", bigText.orEmpty())
        .put("textLines", JSONArray(textLines))
        .put("parsed", parsed.toJson())
        .put("test", test)
        .put("signerSha256", signerSha256 ?: JSONObject.NULL)
        .put("appVersion", appVersion ?: JSONObject.NULL)
        .toString()

    companion object {
        fun test(context: Context): NotificationEvent {
            val now = Instant.now().toString()
            return NotificationEvent(
                eventId = "test-${java.util.UUID.randomUUID()}",
                packageName = context.packageName,
                notificationKey = "connection-test",
                postedAt = now,
                capturedAt = now,
                title = null,
                text = null,
                bigText = null,
                textLines = emptyList(),
                parsed = ParsedTransaction("unknown", null, null, null, null, null, null),
                test = true,
                signerSha256 = PackageEvidence.signerSha256(context, context.packageName),
                appVersion = PackageEvidence.appVersion(context, context.packageName),
            )
        }
    }
}

internal object NotificationEventFactory {
    private const val MAX_TEXT = 2_048
    private const val MAX_KEY = 512
    private const val MAX_LINES = 8
    private const val MAX_LINE_TEXT = 512

    fun from(context: Context, sbn: StatusBarNotification): NotificationEvent {
        val extras = sbn.notification.extras
        val title = safe(extras.getCharSequence(android.app.Notification.EXTRA_TITLE), MAX_TEXT)
        val text = safe(extras.getCharSequence(android.app.Notification.EXTRA_TEXT), MAX_TEXT)
        val bigText = safe(extras.getCharSequence(android.app.Notification.EXTRA_BIG_TEXT), MAX_TEXT)
        val lines = (extras.getCharSequenceArray(android.app.Notification.EXTRA_TEXT_LINES) ?: emptyArray())
            .take(MAX_LINES)
            .mapNotNull { safe(it, MAX_LINE_TEXT) }
        val key = sbn.key.take(MAX_KEY)
        val parsed = NotificationParser.parse(sbn.packageName, title, text, bigText, lines)
        val eventSeed = listOf(sbn.packageName, key, sbn.postTime.toString(), title, text, bigText)
            .joinToString("\n")
        return NotificationEvent(
            eventId = sha256(eventSeed),
            packageName = sbn.packageName,
            notificationKey = key,
            postedAt = Instant.ofEpochMilli(sbn.postTime).toString(),
            capturedAt = Instant.now().toString(),
            title = title,
            text = text,
            bigText = bigText,
            textLines = lines,
            parsed = parsed,
            test = false,
            signerSha256 = PackageEvidence.signerSha256(context, sbn.packageName),
            appVersion = PackageEvidence.appVersion(context, sbn.packageName),
        )
    }

    private fun safe(value: CharSequence?, maxLength: Int): String? =
        value?.toString()
            ?.replace('\u0000', ' ')
            ?.trim()
            ?.take(maxLength)
            ?.takeIf(String::isNotEmpty)

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}

internal object PackageEvidence {
    @Suppress("DEPRECATION")
    fun signerSha256(context: Context, packageName: String): String? {
        return try {
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                context.packageManager.getPackageInfo(
                    packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES,
                )
            } else {
                context.packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNATURES)
            }
            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.signingInfo?.apkContentsSigners.orEmpty()
            } else {
                info.signatures.orEmpty()
            }
            signatures.firstOrNull()?.toByteArray()?.let {
                MessageDigest.getInstance("SHA-256").digest(it)
                    .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
            }
        } catch (_: Exception) {
            null
        }
    }

    @Suppress("DEPRECATION")
    fun appVersion(context: Context, packageName: String): String? = try {
        context.packageManager.getPackageInfo(packageName, 0).versionName
    } catch (_: Exception) {
        null
    }
}
