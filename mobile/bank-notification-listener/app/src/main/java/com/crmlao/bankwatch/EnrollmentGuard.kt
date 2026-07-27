package com.crmlao.bankwatch

internal data class EnrollmentIdentity(
    val serverUrl: String,
    val deviceId: String,
)

internal object EnrollmentGuard {
    val lock = Any()

    fun changed(previous: EnrollmentIdentity, next: EnrollmentIdentity): Boolean =
        previous != next
}
