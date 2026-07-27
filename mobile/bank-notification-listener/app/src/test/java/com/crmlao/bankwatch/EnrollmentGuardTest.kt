package com.crmlao.bankwatch

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EnrollmentGuardTest {
    @Test
    fun sameEnrollmentDoesNotClearQueueForSecretRefresh() {
        val enrollment = EnrollmentIdentity("https://crm.example.com", "device-1")
        assertFalse(EnrollmentGuard.changed(enrollment, enrollment.copy()))
    }

    @Test
    fun serverOrDeviceChangeRequiresQueueClear() {
        val previous = EnrollmentIdentity("https://crm.example.com", "device-1")
        assertTrue(
            EnrollmentGuard.changed(
                previous,
                previous.copy(serverUrl = "https://other.example.com"),
            ),
        )
        assertTrue(
            EnrollmentGuard.changed(
                previous,
                previous.copy(deviceId = "device-2"),
            ),
        )
    }
}
