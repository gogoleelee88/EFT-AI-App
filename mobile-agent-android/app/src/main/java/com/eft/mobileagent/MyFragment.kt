package com.eft.mobileagent

import android.os.Bundle
import android.view.View
import androidx.fragment.app.Fragment

class MyFragment : Fragment(R.layout.fragment_my) {

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        view.findViewById<View>(R.id.scanPairingQrButton)?.setOnClickListener {
            // TODO move QR scan launcher
        }

        view.findViewById<View>(R.id.logoutSyncUserButton)?.setOnClickListener {
            // TODO move logoutSyncUser logic
        }
    }
}
