package com.crmlao.bankwatch

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.UUID
import java.util.concurrent.TimeUnit

internal object UploadQueue {
    fun enqueue(
        context: Context,
        event: NotificationEvent,
        expectedEnrollment: EnrollmentIdentity,
    ): UUID? = synchronized(EnrollmentGuard.lock) {
        try {
            val applicationContext = context.applicationContext
            val currentEnrollment = AppSettings(applicationContext).snapshot().enrollment
            if (EnrollmentGuard.changed(expectedEnrollment, currentEnrollment)) {
                StatusStore(context).update("การเชื่อมต่อเปลี่ยนระหว่างรับข้อมูล — ไม่ได้ส่งรายการเดิม")
                return@synchronized null
            }

            val queueFile = QueueStore(applicationContext).write(event)
            val request = OneTimeWorkRequestBuilder<BankNotificationWorker>()
                .setInputData(workDataOf(BankNotificationWorker.INPUT_QUEUE_FILE to queueFile))
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .addTag(WORK_TAG)
                .build()

            WorkManager.getInstance(applicationContext).enqueueUniqueWork(
                "bank-notification-${event.eventId}",
                ExistingWorkPolicy.KEEP,
                request,
            )
            request.id
        } catch (_: Exception) {
            StatusStore(context).update("จัดคิวไม่สำเร็จ — ตรวจสอบการตั้งค่าเครื่อง")
            null
        }
    }

    const val WORK_TAG = "crm-bank-notification-upload"
}
