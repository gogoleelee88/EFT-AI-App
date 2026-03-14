package com.eft.mobileagent

import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.eft.mobileagent.planner.PlannerLauncher
import com.eft.mobileagent.planner.PlannerTab
import com.google.android.material.button.MaterialButton

class PlannerTabFragment : Fragment(R.layout.fragment_planner_tab) {
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val statusText = view.findViewById<TextView>(R.id.plannerStatusText)
        val resumeButton = view.findViewById<MaterialButton>(R.id.openPlannerPrimaryButton)
        val deadlineButton = view.findViewById<MaterialButton>(R.id.openDeadlinePlannerButton)
        val todayButton = view.findViewById<MaterialButton>(R.id.openTodayPlannerButton)
        val alarmButton = view.findViewById<MaterialButton>(R.id.openAlarmPlannerButton)

        val baseUrl = PlannerLauncher.resolvePlannerBaseUrl(requireContext())
        val lastTab = PlannerLauncher.getLastOpenedTab(requireContext())
        statusText.text = if (baseUrl != null) {
            "Shared planner ready. Last tab: ${lastTab.title}"
        } else {
            "Planner web host is not configured. Check the mobile web base URL."
        }
        resumeButton.text = "Continue ${lastTab.title.lowercase()}"

        resumeButton.setOnClickListener { openPlanner(lastTab, source = "mobile_plan_tab_resume") }
        deadlineButton.setOnClickListener { openPlanner(PlannerTab.DEADLINE) }
        todayButton.setOnClickListener { openPlanner(PlannerTab.TODAY) }
        alarmButton.setOnClickListener { openPlanner(PlannerTab.ALARM) }

        val enabled = baseUrl != null
        resumeButton.isEnabled = enabled
        deadlineButton.isEnabled = enabled
        todayButton.isEnabled = enabled
        alarmButton.isEnabled = enabled
    }

    private fun openPlanner(
        tab: PlannerTab,
        source: String = "mobile_plan_tab",
    ) {
        PlannerLauncher.open(
            context = requireContext(),
            tab = tab,
            source = source,
        )
    }
}
