package com.crmlao.bankwatch

import android.content.Context
import java.text.DateFormat
import java.util.Date

internal class StatusStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun update(message: String) {
        preferences.edit()
            .putString(LAST_MESSAGE, message)
            .putLong(LAST_UPDATED_AT, System.currentTimeMillis())
            .apply()
    }

    fun display(): String {
        val message = preferences.getString(LAST_MESSAGE, null) ?: return "ยังไม่เคยส่งข้อมูล"
        val updatedAt = preferences.getLong(LAST_UPDATED_AT, 0L)
        if (updatedAt <= 0L) return message
        val formatted = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.MEDIUM)
            .format(Date(updatedAt))
        return "$message\n$formatted"
    }

    companion object {
        private const val PREFERENCES = "bank_watch_status"
        private const val LAST_MESSAGE = "last_message"
        private const val LAST_UPDATED_AT = "last_updated_at"
    }
}
