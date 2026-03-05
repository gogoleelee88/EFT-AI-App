package com.eft.mobileagent.calendar

import android.content.Context
import android.view.LayoutInflater
import android.widget.TextView
import com.eft.mobileagent.R
import com.google.android.material.bottomsheet.BottomSheetDialog
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class GoogleEventBottomSheet(
    context: Context,
    item: OverlayItem,
) : BottomSheetDialog(context) {

    init {
        val view = LayoutInflater.from(context)
            .inflate(R.layout.bottom_sheet_google_event_detail, null)

        val title = view.findViewById<TextView>(R.id.eventTitle)
        val time = view.findViewById<TextView>(R.id.eventTime)
        val desc = view.findViewById<TextView>(R.id.eventDescription)

        title.text = item.title

        val kst = ZoneId.of("Asia/Seoul")
        val formatter = DateTimeFormatter.ofPattern("HH:mm")
        val start = Instant.ofEpochMilli(item.startMillis)
            .atZone(kst)
            .format(formatter)
        val end = item.endMillis?.let {
            Instant.ofEpochMilli(it).atZone(kst).format(formatter)
        }

        time.text = if (end != null) "$start ~ $end" else start
        desc.text = item.description ?: ""

        setContentView(view)
    }
}
