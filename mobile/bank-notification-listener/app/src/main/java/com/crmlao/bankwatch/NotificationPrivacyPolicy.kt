package com.crmlao.bankwatch

import java.math.BigDecimal

internal object NotificationPrivacyPolicy {
    private val secretPattern = Regex(
        "(?i)(?:\\botp\\b|one[\\s-]*time\\s+password|verification\\s+code|" +
            "security\\s+code|รหัส(?:ผ่าน)?(?:ครั้งเดียว|ยืนยัน)|รหัส\\s*otp|ห้ามบอก|" +
            "ລະຫັດ\\s*otp|ລະຫັດ(?:ຜ່ານ)?(?:ຄັ້ງດຽວ|ຢືນຢັນ)|ຫ້າມບອກ)",
    )

    fun canUpload(event: NotificationEvent): Boolean {
        if (event.test) return true
        if (event.parsed.direction != "credit") return false
        val amount = event.parsed.amount?.toBigDecimalOrNull() ?: return false
        if (amount <= BigDecimal.ZERO || event.parsed.currency.isNullOrBlank()) return false

        val visibleText = buildString {
            append(event.title.orEmpty())
            append('\n')
            append(event.text.orEmpty())
            append('\n')
            append(event.bigText.orEmpty())
            event.textLines.forEach {
                append('\n')
                append(it)
            }
        }
        return !secretPattern.containsMatchIn(visibleText)
    }
}
