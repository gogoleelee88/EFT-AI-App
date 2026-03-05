package com.eft.mobileagent.calendar

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.eft.mobileagent.R
import com.google.android.material.chip.Chip
import java.lang.System.currentTimeMillis
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

class OverlayAgendaAdapter(
    private val onItemClick: ((OverlayItem) -> Unit)? = null,
) : ListAdapter<OverlayItem, OverlayAgendaAdapter.OverlayViewHolder>(OverlayDiffCallback) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): OverlayViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_overlay_event, parent, false)
        return OverlayViewHolder(view)
    }

    override fun onBindViewHolder(holder: OverlayViewHolder, position: Int) {
        val item = getItem(position)
        holder.bind(item)
        holder.itemView.setOnClickListener {
            onItemClick?.invoke(item)
        }
    }

    class OverlayViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val timeText: TextView = itemView.findViewById(R.id.timeText)
        private val timeSubText: TextView = itemView.findViewById(R.id.timeSubText)
        private val titleText: TextView = itemView.findViewById(R.id.titleText)
        private val sourceChip: Chip = itemView.findViewById(R.id.sourceChip)
        private val missionChip: Chip = itemView.findViewById(R.id.missionChip)
        private val statusChip: Chip = itemView.findViewById(R.id.statusChip)
        private val subText: TextView = itemView.findViewById(R.id.subText)

        fun bind(item: OverlayItem) {
            val zone = ZoneId.of("Asia/Seoul")
            val localDateTime = Instant.ofEpochMilli(item.startMillis).atZone(zone).toLocalDateTime()
            val hhmm = DateTimeFormatter.ofPattern("HH:mm", Locale.KOREA).format(localDateTime)
            val ampm = DateTimeFormatter.ofPattern("a", Locale.ENGLISH).format(localDateTime).uppercase(Locale.ENGLISH)

            timeText.text = hhmm
            timeSubText.text = ampm
            titleText.text = item.title

            sourceChip.text = if (item.source == "google") "Google" else "App"

            val mission = item.missionType.orEmpty().trim()
            if (mission.isNotBlank()) {
                missionChip.visibility = View.VISIBLE
                missionChip.text = missionLabel(mission)
            } else {
                missionChip.visibility = View.GONE
            }

            statusChip.visibility = View.GONE
            val delta = item.startMillis - currentTimeMillis()
            when {
                delta < -10 * 60 * 1000L -> {
                    statusChip.text = "Late"
                    statusChip.visibility = View.VISIBLE
                }

                delta in 0..(30 * 60 * 1000L) -> {
                    statusChip.text = "Next"
                    statusChip.visibility = View.VISIBLE
                }
            }

            subText.text = if (item.source == "google") {
                "Google event"
            } else {
                "App schedule"
            }
        }

        private fun missionLabel(raw: String): String {
            return when (raw.lowercase(Locale.ENGLISH)) {
                "location_arrival" -> "Location"
                "photo" -> "Photo"
                "manual_dismiss" -> "Manual"
                else -> raw
            }
        }
    }

    private object OverlayDiffCallback : DiffUtil.ItemCallback<OverlayItem>() {
        override fun areItemsTheSame(oldItem: OverlayItem, newItem: OverlayItem): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: OverlayItem, newItem: OverlayItem): Boolean {
            return oldItem == newItem
        }
    }
}
