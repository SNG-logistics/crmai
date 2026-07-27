package com.crmlao.bankwatch

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationPrivacyPolicyTest {
    @Test
    fun acceptsCreditWithPositiveAmountAndCurrency() {
        assertTrue(
            NotificationPrivacyPolicy.canUpload(
                event(
                    parsed = ParsedTransaction("credit", "100.25", "THB", null, null, null, null),
                    text = "เงินเข้า 100.25 บาท",
                ),
            ),
        )
    }

    @Test
    fun rejectsDebitUnknownAndMissingCurrency() {
        assertFalse(
            NotificationPrivacyPolicy.canUpload(
                event(ParsedTransaction("debit", "100", "THB", null, null, null, null)),
            ),
        )
        assertFalse(
            NotificationPrivacyPolicy.canUpload(
                event(ParsedTransaction("unknown", "100", "THB", null, null, null, null)),
            ),
        )
        assertFalse(
            NotificationPrivacyPolicy.canUpload(
                event(ParsedTransaction("credit", "100", null, null, null, null, null)),
            ),
        )
    }

    @Test
    fun rejectsOtpEvenWhenMessageLooksLikeCredit() {
        assertFalse(
            NotificationPrivacyPolicy.canUpload(
                event(
                    parsed = ParsedTransaction("credit", "100", "THB", null, null, null, null),
                    text = "เงินเข้า 100 บาท รหัส OTP 123456 ห้ามบอกผู้อื่น",
                ),
            ),
        )
    }

    private fun event(
        parsed: ParsedTransaction,
        text: String = "เงินเข้า",
    ) = NotificationEvent(
        eventId = "a".repeat(64),
        packageName = "com.example.bank",
        notificationKey = "key",
        postedAt = "2026-01-01T00:00:00Z",
        capturedAt = "2026-01-01T00:00:01Z",
        title = "แจ้งเตือน",
        text = text,
        bigText = null,
        textLines = emptyList(),
        parsed = parsed,
        test = false,
        signerSha256 = "b".repeat(64),
        appVersion = "1.0",
    )
}
