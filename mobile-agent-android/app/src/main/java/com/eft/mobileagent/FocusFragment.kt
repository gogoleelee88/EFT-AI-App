package com.eft.mobileagent

import android.os.Bundle
import android.view.View
import androidx.fragment.app.Fragment
import com.eft.mobileagent.behavior.BehaviorAgentController

class FocusFragment : Fragment(R.layout.fragment_focus) {

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        view.findViewById<View>(R.id.behaviorStartButton)?.setOnClickListener {
            BehaviorAgentController.start(requireContext())
        }

        view.findViewById<View>(R.id.behaviorStopButton)?.setOnClickListener {
            BehaviorAgentController.stop(requireContext())
        }
    }
}
