package com.crmlao.bankwatch

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class BankNotificationListenerService : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val notification = sbn ?: return
        val settings = AppSettings(applicationContext).snapshot()

        // Fail closed: an empty allowlist never sends notifications.
        if (notification.packageName !in settings.allowedPackages) return
        if (
            settings.serverUrl.isBlank() ||
            settings.deviceId.isBlank() ||
            settings.deviceSecret.isNullOrBlank()
        ) return

        val event = try {
            NotificationEventFactory.from(applicationContext, notification)
        } catch (_: Exception) {
            StatusStore(applicationContext).update("อ่านการแจ้งเตือนไม่สำเร็จ")
            return
        }
        if (!NotificationPrivacyPolicy.canUpload(event)) return
        if (event.signerSha256?.matches(Regex("[a-f0-9]{64}")) != true) {
            StatusStore(applicationContext).update("ตรวจลายเซ็นแอปธนาคารไม่ได้ — ไม่ได้ส่งข้อมูล")
            return
        }
        UploadQueue.enqueue(applicationContext, event, settings.enrollment)
    }
}
