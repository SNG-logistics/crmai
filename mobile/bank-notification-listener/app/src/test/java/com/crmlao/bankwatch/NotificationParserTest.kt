package com.crmlao.bankwatch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationParserTest {
    @Test
    fun parsesThaiCreditNotification() {
        val parsed = NotificationParser.parse(
            packageName = "com.scb.phone",
            title = "เงินเข้า",
            text = "ได้รับเงิน 1,250.50 บาท จาก Somchai",
            bigText = "บัญชี xxx-7890 เลขอ้างอิง ABC123456",
            lines = emptyList(),
        )

        assertEquals("credit", parsed.direction)
        assertEquals("1250.5", parsed.amount)
        assertEquals("THB", parsed.currency)
        assertEquals("ABC123456", parsed.transactionRef)
        assertEquals("7890", parsed.accountSuffix)
        assertEquals("SCB", parsed.bankHint)
    }

    @Test
    fun parsesLaoCreditNotification() {
        val parsed = NotificationParser.parse(
            packageName = "com.example.bcel",
            title = "ເງິນເຂົ້າ",
            text = "ໄດ້ຮັບເງິນ 500,000 ກີບ",
            bigText = "ເລກທຸລະກຳ: LAO998877",
            lines = emptyList(),
        )

        assertEquals("credit", parsed.direction)
        assertEquals("500000", parsed.amount)
        assertEquals("LAK", parsed.currency)
        assertEquals("LAO998877", parsed.transactionRef)
        assertEquals("BCEL", parsed.bankHint)
    }

    @Test
    fun doesNotInventFieldsForGenericNotification() {
        val parsed = NotificationParser.parse(
            packageName = "com.example.bank",
            title = "Welcome",
            text = "Open the app to see promotions",
            bigText = null,
            lines = emptyList(),
        )

        assertEquals("unknown", parsed.direction)
        assertNull(parsed.amount)
        assertNull(parsed.currency)
        assertNull(parsed.transactionRef)
    }

    @Test
    fun recognizesDebitWithoutTreatingItAsCredit() {
        val parsed = NotificationParser.parse(
            packageName = "com.example.bank",
            title = "โอนออกสำเร็จ",
            text = "ชำระเงิน 99.00 THB",
            bigText = null,
            lines = emptyList(),
        )

        assertEquals("debit", parsed.direction)
        assertEquals("99", parsed.amount)
        assertEquals("THB", parsed.currency)
    }
}
