package com.crmlao.bankwatch

import java.math.BigDecimal
import java.util.Locale

internal object NotificationParser {
    private val creditKeywords = listOf(
        "เงินเข้า", "รับเงิน", "ได้รับเงิน", "โอนเข้า", "ยอดเงินเข้า", "ฝากเงินเข้า",
        "credited", "credit received", "incoming transfer", "money received",
        "ເງິນເຂົ້າ", "ໄດ້ຮັບເງິນ", "ຮັບເງິນ", "ໂອນເຂົ້າ", "ເຂົ້າບັນຊີ",
    )
    private val debitKeywords = listOf(
        "เงินออก", "โอนออก", "ชำระเงิน", "หักบัญชี", "ถอนเงิน",
        "debited", "outgoing transfer", "payment made", "paid",
        "ເງິນອອກ", "ໂອນອອກ", "ຊຳລະເງິນ", "ຈ່າຍເງິນ", "ຫັກບັນຊີ",
    )
    private val amountPattern = Regex(
        "(?i)(?:฿|บาท|THB|LAK|KIP|ກີບ|USD|US\\$|\\$)\\s*" +
            "([0-9][0-9,]*(?:\\.[0-9]{1,2})?)|" +
            "([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*" +
            "(?:฿|บาท|THB|LAK|KIP|ກີບ|USD|US\\$|\\$)",
    )
    private val referencePattern = Regex(
        "(?i)(?:เลข(?:ที่)?(?:รายการ|อ้างอิง|ธุรกรรม)?|รหัส(?:รายการ|อ้างอิง|ธุรกรรม)?|" +
            "ref(?:erence)?|transaction\\s*(?:id|no)|txn(?:\\s*id)?|" +
            "ເລກ(?:ທຸລະກຳ|ອ້າງອີງ)?|ລະຫັດ(?:ທຸລະກຳ)?)\\s*[:：#-]?\\s*" +
            "([A-Z0-9][A-Z0-9-]{5,40})",
    )
    private val accountPattern = Regex(
        "(?i)(?:บัญชี|เลขที่บัญชี|account|a/c|ບັນຊີ|[*xX•]{2,}|ending)\\s*" +
            "(?:no\\.?|number)?\\s*[:：-]?\\s*(?:[*xX•-]*)([0-9]{3,6})\\b",
    )
    private val senderPattern = Regex(
        "(?i)(?:ผู้โอน|จาก|sender|from|ຜູ້ໂອນ|ຈາກ)\\s*[:：-]?\\s*([^\\n|,]{2,60})",
    )

    fun parse(
        packageName: String,
        title: String?,
        text: String?,
        bigText: String?,
        lines: List<String>,
    ): ParsedTransaction {
        val combined = listOfNotNull(title, text, bigText).plus(lines).joinToString("\n")
        val normalized = combined.lowercase(Locale.ROOT)
        val creditScore = creditKeywords.count(normalized::contains)
        val debitScore = debitKeywords.count(normalized::contains)
        val direction = when {
            creditScore > debitScore -> "credit"
            debitScore > creditScore -> "debit"
            else -> "unknown"
        }

        val amountMatch = amountPattern.find(combined)
        val amountRaw = amountMatch?.groups?.get(1)?.value
            ?: amountMatch?.groups?.get(2)?.value
        val amount = amountRaw?.replace(",", "")?.toBigDecimalOrNull()
            ?.takeIf { it > BigDecimal.ZERO }
            ?.stripTrailingZeros()
            ?.toPlainString()
        val currencyContext = amountMatch?.value.orEmpty().uppercase(Locale.ROOT)
        val currency = when {
            currencyContext.contains("USD") || currencyContext.contains('\u0024') -> "USD"
            currencyContext.contains("LAK") || currencyContext.contains("KIP") ||
                currencyContext.contains("ກີບ") -> "LAK"
            currencyContext.contains("THB") || currencyContext.contains("฿") ||
                currencyContext.contains("บาท") -> "THB"
            else -> null
        }

        val transactionRef = referencePattern.find(combined)?.groupValues?.getOrNull(1)
            ?.trim()
            ?.uppercase(Locale.ROOT)
        val accountSuffix = accountPattern.find(combined)?.groupValues?.getOrNull(1)
        val sender = senderPattern.find(combined)?.groupValues?.getOrNull(1)
            ?.trim()
            ?.take(60)
        val bankHint = detectBank(packageName, normalized)

        return ParsedTransaction(
            direction = direction,
            amount = amount,
            currency = currency,
            transactionRef = transactionRef,
            accountSuffix = accountSuffix,
            sender = sender,
            bankHint = bankHint,
        )
    }

    private fun detectBank(packageName: String, text: String): String? {
        val source = "$packageName $text".lowercase(Locale.ROOT)
        return when {
            listOf("kasikorn", "กสิกร", "kbank").any(source::contains) -> "KBANK"
            listOf("ไทยพาณิชย์", "siam commercial", "scb").any(source::contains) -> "SCB"
            listOf("กรุงไทย", "krungthai", "ktb").any(source::contains) -> "KTB"
            listOf("bangkok bank", "ธนาคารกรุงเทพ", "bbl").any(source::contains) -> "BBL"
            listOf("krungsri", "กรุงศรี", "bay").any(source::contains) -> "BAY"
            listOf("ttb", "ทหารไทยธนชาต").any(source::contains) -> "TTB"
            listOf("ออมสิน", "government savings bank", "gsb").any(source::contains) -> "GSB"
            listOf("bcel", "ທະນາຄານການຄ້າຕ່າງປະເທດລາວ").any(source::contains) -> "BCEL"
            listOf("joint development bank", "jdb").any(source::contains) -> "JDB"
            listOf("lao development bank", "ldb").any(source::contains) -> "LDB"
            else -> null
        }
    }
}
