package com.eft.mobileagent.calendar

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.eft.mobileagent.R
import com.eft.mobileagent.alarm.AlarmRepository
import com.eft.mobileagent.alarm.AlarmSourceType
import com.eft.mobileagent.alarm.ReminderSyncClient
import com.eft.mobileagent.alarm.ReminderSyncManager
import com.eft.mobileagent.behavior.BehaviorAgentConfigStore
import com.eft.mobileagent.planner.PlannerLauncher
import com.eft.mobileagent.planner.PlannerTab
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.switchmaterial.SwitchMaterial
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.LinkedHashMap
import java.util.Locale

class CalendarOverlayFragment : Fragment(R.layout.fragment_calendar_overlay) {
    private val koreaZoneId: ZoneId = ZoneId.of("Asia/Seoul")
    private val nowFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm", Locale.KOREA)
    private val selectedDate: LocalDate
        get() = LocalDate.now(koreaZoneId)

    private lateinit var dateText: TextView
    private lateinit var nowText: TextView
    private lateinit var toggleGoogle: SwitchMaterial
    private lateinit var toggleService: SwitchMaterial
    private lateinit var loadingText: TextView
    private lateinit var emptyState: LinearLayout
    private lateinit var googleCtaRow: LinearLayout
    private lateinit var googleCtaText: TextView
    private lateinit var googleConnectButton: Button
    private lateinit var emptyPrimaryCta: Button
    private lateinit var recyclerView: RecyclerView
    private lateinit var adapter: OverlayAgendaAdapter

    private var loadToken: Int = 0
    private val nowHandler = Handler(Looper.getMainLooper())
    private val nowTick = object : Runnable {
        override fun run() {
            nowText.text = "NOW ${LocalTime.now(koreaZoneId).format(nowFormatter)}"
            nowHandler.postDelayed(this, 60_000L)
        }
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        dateText = view.findViewById(R.id.dateText)
        nowText = view.findViewById(R.id.nowText)
        toggleGoogle = view.findViewById(R.id.toggleGoogle)
        toggleService = view.findViewById(R.id.toggleService)
        loadingText = view.findViewById(R.id.loadingText)
        emptyState = view.findViewById(R.id.emptyState)
        googleCtaRow = view.findViewById(R.id.googleCtaRow)
        googleCtaText = view.findViewById(R.id.googleCtaText)
        googleConnectButton = view.findViewById(R.id.googleConnectButton)
        emptyPrimaryCta = view.findViewById(R.id.emptyPrimaryCta)
        recyclerView = view.findViewById(R.id.agendaRecycler)

        adapter = OverlayAgendaAdapter { item -> handleRowClick(item) }
        recyclerView.layoutManager = LinearLayoutManager(requireContext())
        recyclerView.adapter = adapter

        renderHeaderDateAndNow()

        toggleGoogle.setOnCheckedChangeListener { _, _ -> loadData() }
        toggleService.setOnCheckedChangeListener { _, _ -> loadData() }
        googleConnectButton.setOnClickListener { handleGoogleConnect() }
        emptyPrimaryCta.setOnClickListener { navigateToAddAlarm() }

        loadData()
    }

    override fun onStart() {
        super.onStart()
        nowHandler.removeCallbacks(nowTick)
        nowHandler.post(nowTick)
    }

    override fun onResume() {
        super.onResume()
        loadData()
    }

    override fun onStop() {
        nowHandler.removeCallbacks(nowTick)
        super.onStop()
    }

    private fun renderHeaderDateAndNow() {
        val dateFormatter = DateTimeFormatter.ofPattern("MMM d, EEE", Locale.ENGLISH)
        dateText.text = selectedDate.format(dateFormatter)
        nowText.text = "NOW ${LocalTime.now(koreaZoneId).format(nowFormatter)}"
    }

    private fun loadData() {
        val currentLoadToken = ++loadToken
        val showGoogle = toggleGoogle.isChecked
        val showService = toggleService.isChecked

        if (!showGoogle && !showService) {
            adapter.submitList(emptyList())
            emptyState.visibility = View.VISIBLE
            googleCtaRow.visibility = View.GONE
            loadingText.visibility = View.GONE
            return
        }

        val behaviorConfig = BehaviorAgentConfigStore(requireContext()).load()
        val accessToken = behaviorConfig.accessToken?.trim()?.ifBlank { null }
        val syncConfig = ReminderSyncManager.loadConfig(requireContext())
        val dateIso = selectedDate.toString()

        loadingText.visibility = View.VISIBLE
        loadingText.text = "Loading..."
        emptyState.visibility = View.GONE
        googleCtaRow.visibility = View.GONE

        Thread {
            val apiClient = CalendarOverlayApiClient(behaviorConfig.backendBaseUrl)
            val merged = mutableListOf<OverlayItem>()
            var googleCtaMessage: String? = null

            if (showService) {
                merged += loadLocalAlarmItems(dateIso).filter { it.source != "google" }

                if (!accessToken.isNullOrBlank()) {
                    runCatching {
                        loadPlannerServiceItems(
                            apiClient = apiClient,
                            dateIso = dateIso,
                            accessToken = accessToken,
                        )
                    }.onSuccess { merged += it }
                } else if (syncConfig != null) {
                    runCatching {
                        ReminderSyncClient(syncConfig.baseUrl)
                            .fetchActiveReminders(syncConfig.userId)
                            .mapNotNull { OverlayMapper.fromSyncedReminder(it, dateIso) }
                            .filter { it.source != "google" }
                    }.onSuccess { merged += it }
                }
            }

            if (showGoogle) {
                merged += loadLocalAlarmItems(dateIso).filter { it.source == "google" }

                if (accessToken.isNullOrBlank()) {
                    googleCtaMessage = "Secure login required for Google Calendar."
                } else {
                    runCatching {
                        apiClient.fetchGoogleConnectionState(accessToken)
                    }.onSuccess { state ->
                        if (!state.connected) {
                            googleCtaMessage = "Google is not connected."
                        } else {
                            runCatching {
                                apiClient.fetchGoogleEvents(dateIso = dateIso, accessToken = accessToken)
                                    .mapNotNull(OverlayMapper::fromGoogle)
                            }.onSuccess { merged += it }
                                .onFailure { err ->
                                    googleCtaMessage = if (isAuthError(err)) {
                                        "Secure login required for Google Calendar."
                                    } else {
                                        "Google Calendar could not be loaded."
                                    }
                                }
                        }
                    }.onFailure { err ->
                        googleCtaMessage = if (isAuthError(err)) {
                            "Secure login required for Google Calendar."
                        } else {
                            "Google Calendar status could not be checked."
                        }
                    }
                }
            }

            val sorted = dedupeAgenda(merged).sortedBy { it.startMillis }
            activity?.runOnUiThread {
                if (!isAdded || currentLoadToken != loadToken) return@runOnUiThread

                adapter.submitList(sorted) {
                    if (sorted.isNotEmpty()) {
                        val now = System.currentTimeMillis()
                        val idx = sorted.indexOfFirst { it.startMillis >= now }
                            .let { if (it == -1) 0 else it }
                        recyclerView.scrollToPosition((idx - 1).coerceAtLeast(0))
                    }
                }

                loadingText.visibility = View.GONE
                emptyState.visibility = if (sorted.isEmpty()) View.VISIBLE else View.GONE

                if (showGoogle && !googleCtaMessage.isNullOrBlank()) {
                    googleCtaText.text = googleCtaMessage
                    googleCtaRow.visibility = View.VISIBLE
                } else {
                    googleCtaRow.visibility = View.GONE
                }
            }
        }.start()
    }

    private fun loadPlannerServiceItems(
        apiClient: CalendarOverlayApiClient,
        dateIso: String,
        accessToken: String,
    ): List<OverlayItem> {
        val plannerItems = runCatching {
            apiClient.fetchPlannerWorkspace(dateIso = dateIso, accessToken = accessToken)
        }.mapCatching { workspace ->
            OverlayMapper.fromPlannerWorkspace(workspace, dateIso)
                .filter { it.source != "google" }
        }.getOrDefault(emptyList())

        if (plannerItems.isNotEmpty()) {
            return plannerItems
        }

        return apiClient.fetchServicePlanItems(dateIso = dateIso, accessToken = accessToken)
            .mapNotNull { OverlayMapper.fromPlanItem(it, dateIso) }
            .filter { it.source != "google" }
    }

    private fun loadLocalAlarmItems(dateIso: String): List<OverlayItem> {
        val repository = AlarmRepository(requireContext())
        return repository.getAllActiveAlarms().mapNotNull { alarm ->
            val alarmDate = Instant.ofEpochMilli(alarm.triggerAtMillis)
                .atZone(koreaZoneId)
                .toLocalDate()
                .toString()
            val effectiveDate = alarm.planDate.trim().ifBlank { alarmDate }
            if (effectiveDate != dateIso) {
                return@mapNotNull null
            }

            val source = if (alarm.sourceType.equals(AlarmSourceType.GOOGLE.value, ignoreCase = true)) {
                "google"
            } else {
                "service"
            }
            OverlayItem(
                id = "alarm:${alarm.alarmId}",
                source = source,
                sourceType = alarm.sourceType,
                title = alarm.label.ifBlank {
                    if (source == "google") "Google schedule" else "App schedule"
                },
                startMillis = alarm.triggerAtMillis,
                missionType = alarm.missionType,
                taskUid = alarm.taskUid.ifBlank { null },
                targetLatitude = alarm.targetLatitude,
                targetLongitude = alarm.targetLongitude,
                radiusMeters = alarm.radiusMeters.toDouble(),
            )
        }
    }

    private fun dedupeAgenda(items: List<OverlayItem>): List<OverlayItem> {
        val deduped = LinkedHashMap<String, OverlayItem>()
        items.sortedBy { it.startMillis }.forEach { candidate ->
            val key = buildAgendaKey(candidate)
            val current = deduped[key]
            if (current == null || agendaScore(candidate) > agendaScore(current)) {
                deduped[key] = candidate
            }
        }
        return deduped.values.toList()
    }

    private fun buildAgendaKey(item: OverlayItem): String {
        val bucketMinute = item.startMillis / 60_000L
        val normalizedTitle = item.title.trim().lowercase(Locale.ENGLISH)
        return listOf(
            item.source,
            item.taskUid.orEmpty(),
            normalizedTitle,
            bucketMinute.toString(),
        ).joinToString("|")
    }

    private fun agendaScore(item: OverlayItem): Int {
        var score = 0
        if (item.taskUid != null) score += 4
        if (item.missionType != null) score += 2
        if (item.description != null) score += 1
        if (item.id.startsWith("planner:")) score += 3
        if (item.id.startsWith("sync:")) score += 1
        if (item.id.startsWith("google:")) score += 2
        return score
    }

    private fun handleGoogleConnect() {
        val config = BehaviorAgentConfigStore(requireContext()).load()
        val accessToken = config.accessToken?.trim()?.ifBlank { null }
        if (accessToken.isNullOrBlank()) {
            googleCtaText.text = "Open My Page and pair a secure account first."
            googleCtaRow.visibility = View.VISIBLE
            navigateToMyPage()
            return
        }

        loadingText.visibility = View.VISIBLE
        loadingText.text = "Opening Google..."
        Thread {
            val result = runCatching {
                CalendarOverlayApiClient(config.backendBaseUrl).fetchGoogleAuthUrl(
                    accessToken = accessToken,
                    redirectUri = GOOGLE_CALLBACK_URI,
                    nextPath = "/calendar",
                )
            }
            activity?.runOnUiThread {
                if (!isAdded) return@runOnUiThread
                result.onSuccess { authUrl ->
                    loadingText.visibility = View.GONE
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(authUrl)))
                }.onFailure {
                    loadingText.visibility = View.GONE
                    googleCtaText.text = "Google connect flow could not be opened."
                    googleCtaRow.visibility = View.VISIBLE
                }
            }
        }.start()
    }

    private fun navigateToAddAlarm() {
        navigateToPlannerToday()
    }

    private fun navigateToMyPage() {
        val bottomNav = activity?.findViewById<BottomNavigationView>(R.id.bottomNavView)
        bottomNav?.selectedItemId = R.id.nav_my_page
    }

    private fun handleRowClick(item: OverlayItem) {
        if (item.source != "google") {
            val repository = AlarmRepository(requireContext())
            val alarms = repository.getAllActiveAlarms()
            val match = alarms.firstOrNull {
                it.taskUid == item.taskUid &&
                    it.sourceType.equals(item.sourceType, ignoreCase = true)
            }

            match?.let { repository.setLastAlarmId(it.alarmId) }
            navigateToPlannerToday(taskUid = item.taskUid)
            return
        }

        showGoogleEventSheet(item)
    }

    private fun showGoogleEventSheet(item: OverlayItem) {
        if (!isAdded) return
        GoogleEventBottomSheet(requireContext(), item).show()
    }

    private fun isAuthError(err: Throwable): Boolean {
        val message = err.message.orEmpty()
        return message.contains("HTTP 401") || message.contains("HTTP 403")
    }

    private fun navigateToPlannerToday(taskUid: String? = null) {
        val opened = PlannerLauncher.open(
            context = requireContext(),
            tab = PlannerTab.TODAY,
            activeDate = selectedDate.toString(),
            taskUid = taskUid,
            source = if (taskUid.isNullOrBlank()) "mobile_calendar_empty" else "mobile_calendar_item",
        )
        if (!opened) {
            val bottomNav = activity?.findViewById<BottomNavigationView>(R.id.bottomNavView)
            bottomNav?.selectedItemId = R.id.nav_add_alarm
        }
    }

    companion object {
        private const val GOOGLE_CALLBACK_URI = "myapp://oauth/google/callback"
    }
}
