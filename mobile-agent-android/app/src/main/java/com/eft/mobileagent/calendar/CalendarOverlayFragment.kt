package com.eft.mobileagent.calendar

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
import com.eft.mobileagent.behavior.BehaviorAgentConfigStore
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.switchmaterial.SwitchMaterial
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
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
        googleConnectButton = view.findViewById(R.id.googleConnectButton)
        emptyPrimaryCta = view.findViewById(R.id.emptyPrimaryCta)
        recyclerView = view.findViewById(R.id.agendaRecycler)

        adapter = OverlayAgendaAdapter { item -> handleRowClick(item) }
        recyclerView.layoutManager = LinearLayoutManager(requireContext())
        recyclerView.adapter = adapter

        renderHeaderDateAndNow()

        toggleGoogle.setOnCheckedChangeListener { _, _ -> loadData() }
        toggleService.setOnCheckedChangeListener { _, _ -> loadData() }

        googleConnectButton.setOnClickListener {
            loadingText.visibility = View.VISIBLE
            loadingText.text = "Connect Google from the existing account flow."
        }
        emptyPrimaryCta.setOnClickListener {
            loadingText.visibility = View.VISIBLE
            loadingText.text = "Use Add Alarm tab to create app schedules."
        }

        loadData()
    }

    override fun onStart() {
        super.onStart()
        nowHandler.removeCallbacks(nowTick)
        nowHandler.post(nowTick)
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
            loadingText.visibility = View.GONE
            googleCtaRow.visibility = View.GONE
            return
        }

        val config = BehaviorAgentConfigStore(requireContext()).load()
        val accessToken = config.accessToken
        if (accessToken.isNullOrBlank()) {
            adapter.submitList(emptyList())
            emptyState.visibility = View.VISIBLE
            googleCtaRow.visibility = if (showGoogle) View.VISIBLE else View.GONE
            loadingText.visibility = View.VISIBLE
            loadingText.text = "Login required to load calendar."
            return
        }

        loadingText.visibility = View.VISIBLE
        loadingText.text = "Loading..."
        emptyState.visibility = View.GONE
        googleCtaRow.visibility = View.GONE

        val dateIso = selectedDate.toString()
        Thread {
            val client = CalendarOverlayApiClient(config.backendBaseUrl)
            val merged = mutableListOf<OverlayItem>()
            var googleDisconnected = false

            if (showGoogle) {
                runCatching {
                    client.fetchGoogleEvents(dateIso = dateIso, accessToken = accessToken)
                        .mapNotNull(OverlayMapper::fromGoogle)
                }.onSuccess { merged += it }
                    .onFailure { err ->
                        if (err.message.orEmpty().contains("HTTP 404")) {
                            googleDisconnected = true
                        }
                    }
            }

            if (showService) {
                runCatching {
                    client.fetchServicePlanItems(dateIso = dateIso, accessToken = accessToken)
                        .mapNotNull { OverlayMapper.fromPlanItem(it, dateIso) }
                        .filter { it.source == "service" }
                }.onSuccess { merged += it }
            }

            val sorted = merged.sortedBy { it.startMillis }
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
                googleCtaRow.visibility = if (showGoogle && googleDisconnected) View.VISIBLE else View.GONE
            }
        }.start()
    }

    private fun handleRowClick(item: OverlayItem) {
        if (item.source == "service") {
            val repository = AlarmRepository(requireContext())
            val alarms = repository.getAllActiveAlarms()
            val match = alarms.firstOrNull {
                it.taskUid == item.taskUid &&
                    it.planDate == selectedDate.toString() &&
                    it.sourceType == "service"
            }

            match?.let { repository.setLastAlarmId(it.alarmId) }
            val bottomNav = activity?.findViewById<BottomNavigationView>(R.id.bottomNavView)
            bottomNav?.selectedItemId = R.id.nav_add_alarm
            return
        }

        if (item.source == "google") {
            showGoogleEventSheet(item)
        }
    }

    private fun showGoogleEventSheet(item: OverlayItem) {
        if (!isAdded) return
        GoogleEventBottomSheet(requireContext(), item).show()
    }
}
