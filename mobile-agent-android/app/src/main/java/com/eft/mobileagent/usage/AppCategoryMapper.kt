package com.eft.mobileagent.usage

object AppCategoryMapper {
    fun toCategory(packageName: String): String {
        val p = packageName.lowercase()
        return when {
            p.contains("youtube") -> "YouTube"
            p.contains("instagram") || p.contains("facebook") || p.contains("tiktok") -> "SNS"
            p.contains("chrome") || p.contains("samsung.internet") || p.contains("firefox") -> "Browser"
            p.contains("notion") || p.contains("slack") || p.contains("zoom") || p.contains("teams") -> "WorkTool"
            else -> "UnknownExternalApp"
        }
    }
}
