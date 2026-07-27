package com.crmlao.bankwatch

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal object CryptoStore {
    private const val KEYSTORE = "AndroidKeyStore"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"

    fun encrypt(alias: String, plaintext: ByteArray): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(alias))
        return listOf(
            "v1",
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
            Base64.encodeToString(cipher.doFinal(plaintext), Base64.NO_WRAP),
        ).joinToString(":")
    }

    fun decrypt(alias: String, encoded: String): ByteArray {
        val parts = encoded.split(':', limit = 3)
        require(parts.size == 3 && parts[0] == "v1") { "Unsupported encrypted value" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateKey(alias),
            GCMParameterSpec(128, Base64.decode(parts[1], Base64.NO_WRAP)),
        )
        return cipher.doFinal(Base64.decode(parts[2], Base64.NO_WRAP))
    }

    private fun getOrCreateKey(alias: String): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }

        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).run {
            init(
                KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }
}
