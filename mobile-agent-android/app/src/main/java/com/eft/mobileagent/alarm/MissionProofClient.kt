package com.eft.mobileagent.alarm

import java.io.DataOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URLEncoder
import java.net.URL
import java.util.UUID

class MissionProofClient(
    baseUrl: String,
    private val accessToken: String?,
) {
    private val normalizedBaseUrl = baseUrl.trim().removeSuffix("/")

    fun submitTimeCheck(
        planDate: String,
        taskUid: String,
        minSeconds: Int,
    ): Boolean {
        val encodedDate = URLEncoder.encode(planDate, Charsets.UTF_8.name())
        val encodedTaskUid = URLEncoder.encode(taskUid, Charsets.UTF_8.name())
        val endpoint = "$normalizedBaseUrl/api/spec/mission/proofs/time-check" +
            "?plan_date=$encodedDate&task_uid=$encodedTaskUid&min_seconds=$minSeconds"
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            applyAuthHeaders(this)
        }
        return try {
            conn.outputStream.use { it.write(ByteArray(0)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            code in 200..299
        } finally {
            conn.disconnect()
        }
    }

    fun submitPhoto(
        planDate: String,
        taskUid: String,
        minSeconds: Int,
        imageFile: File,
    ): Boolean {
        val endpoint = "$normalizedBaseUrl/api/spec/mission/proofs/photo"
        val boundary = "----EFTBoundary${UUID.randomUUID()}"
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            applyAuthHeaders(this)
        }
        return try {
            DataOutputStream(conn.outputStream).use { out ->
                writeFormField(out, boundary, "plan_date", planDate)
                writeFormField(out, boundary, "task_uid", taskUid)
                writeFormField(out, boundary, "min_seconds", minSeconds.toString())

                out.writeBytes("--$boundary\r\n")
                out.writeBytes(
                    "Content-Disposition: form-data; name=\"image\"; filename=\"${imageFile.name}\"\r\n",
                )
                out.writeBytes("Content-Type: image/jpeg\r\n\r\n")
                imageFile.inputStream().use { input -> input.copyTo(out) }
                out.writeBytes("\r\n")
                out.writeBytes("--$boundary--\r\n")
                out.flush()
            }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            code in 200..299
        } finally {
            conn.disconnect()
        }
    }

    private fun applyAuthHeaders(conn: HttpURLConnection) {
        if (accessToken.isNullOrBlank()) return
        conn.setRequestProperty("Authorization", "Bearer $accessToken")
        conn.setRequestProperty("Cookie", "access_token=$accessToken")
    }

    private fun writeFormField(out: DataOutputStream, boundary: String, key: String, value: String) {
        out.writeBytes("--$boundary\r\n")
        out.writeBytes("Content-Disposition: form-data; name=\"$key\"\r\n\r\n")
        out.writeBytes(value)
        out.writeBytes("\r\n")
    }

    companion object {
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val READ_TIMEOUT_MS = 8_000
    }
}
