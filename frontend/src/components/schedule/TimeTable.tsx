import React, { useState, useRef } from "react";
import { motion, useMotionValue, type PanInfo } from "framer-motion";
import { Clock, EyeOff, GripHorizontal, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PrivacyMode } from "@/types/privacy";

// --- 타입 정의 ---
export type ScheduleItem = {
  id: string;
  title: string;
  raw_title?: string;
  category: "work" | "personal" | "health";
  startTime: number; // 0 ~ 23.5 (ex: 9.5 = 9:30 AM)
  duration: number;  // 시간 단위 (ex: 1.5 = 1시간 30분)
  privacy_mode?: PrivacyMode;
  source?: "google" | "app";
};

interface TimeTableProps {
  date: Date;
  initialEvents: ScheduleItem[];
  onUpdateEvent?: (updatedEvent: ScheduleItem, previousEvent?: ScheduleItem) => void;
}

// --- 상수 설정 ---
const HOUR_HEIGHT = 80;
const SNAP_UNIT_MINUTES = 30;
const SNAP_HEIGHT = HOUR_HEIGHT / (60 / SNAP_UNIT_MINUTES);

// --- 헬퍼 함수 ---
const formatTime = (timeValue: number) => {
  const hour = Math.floor(timeValue);
  const minute = Math.round((timeValue - hour) * 60);
  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
};

export const TimeTable: React.FC<TimeTableProps> = ({
  initialEvents,
  onUpdateEvent,
}) => {
  const [events, setEvents] = useState<ScheduleItem[]>(initialEvents);
  const containerRef = useRef<HTMLDivElement>(null);

  // initialEvents가 변경되면 동기화
  React.useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  const handleEventUpdate = (
    id: string,
    newStart: number,
    newDuration: number
  ) => {
    const previousEvent = events.find((evt) => evt.id === id);
    const updated = events.map((evt) =>
      evt.id === id
        ? { ...evt, startTime: newStart, duration: newDuration }
        : evt
    );
    setEvents(updated);

    const targetEvent = updated.find((e) => e.id === id);
    if (targetEvent && onUpdateEvent) onUpdateEvent(targetEvent, previousEvent);
  };

  return (
    <div className="flex flex-col w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden font-sans">
      {/* 헤더 */}
      <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
        <h2 className="text-sm font-bold text-gray-800">📅 오늘의 일정</h2>
        <span className="text-[10px] text-gray-400">
          드래그: 이동 · 하단 핸들: 시간 조절
        </span>
      </div>

      {/* 타임테이블 바디 (스크롤 영역) */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto overflow-x-hidden"
        style={{ height: "500px" }}
      >
        {/* 배경 그리드 */}
        <div
          className="absolute top-0 left-0 w-full pointer-events-none"
          style={{ height: `${24 * HOUR_HEIGHT}px` }}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start border-b border-gray-100 text-xs text-gray-400"
              style={{ height: `${HOUR_HEIGHT}px` }}
            >
              <div className="w-12 text-center -mt-2 pr-2 select-none">
                {i}:00
              </div>
              <div className="flex-1 border-l border-gray-100 h-full relative">
                <div className="absolute top-1/2 w-full border-t border-dashed border-gray-200/50 left-0" />
              </div>
            </div>
          ))}
        </div>

        {/* 일정 카드들 (절대 위치) */}
        <div
          className="relative"
          style={{ height: `${24 * HOUR_HEIGHT}px` }}
        >
          {events.map((event) => (
            <DraggableEventBlock
              key={event.id}
              event={event}
              containerRef={containerRef}
              onUpdate={handleEventUpdate}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// --- 개별 이벤트 블록 ---
interface BlockProps {
  event: ScheduleItem;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onUpdate: (id: string, start: number, duration: number) => void;
}

const DraggableEventBlock: React.FC<BlockProps> = ({
  event,
  containerRef,
  onUpdate,
}) => {
  const y = useMotionValue(event.startTime * HOUR_HEIGHT);
  const h = useMotionValue(event.duration * HOUR_HEIGHT);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // props 변경 시 위치/높이 동기화
  React.useEffect(() => {
    if (!isDragging && !isResizing) {
      y.set(event.startTime * HOUR_HEIGHT);
      h.set(event.duration * HOUR_HEIGHT);
    }
  }, [event.startTime, event.duration, isDragging, isResizing, y, h]);

  // --- 드래그 앤 드롭 (위치 이동) ---
  const handleDragEnd = () => {
    setIsDragging(false);
    const currentY = y.get();
    const snappedY = Math.round(currentY / SNAP_HEIGHT) * SNAP_HEIGHT;
    const newStartTime = Math.max(
      0,
      Math.min(23.5, snappedY / HOUR_HEIGHT)
    );
    y.set(newStartTime * HOUR_HEIGHT);
    onUpdate(event.id, newStartTime, event.duration);
  };

  // --- 리사이징 (크기 조절) ---
  const handleResizeDrag = (_: unknown, info: PanInfo) => {
    const currentHeight = h.get();
    const newHeight = currentHeight + info.delta.y;
    if (newHeight >= SNAP_HEIGHT) {
      h.set(newHeight);
    }
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
    const currentHeight = h.get();
    const snappedHeight =
      Math.max(1, Math.round(currentHeight / SNAP_HEIGHT)) * SNAP_HEIGHT;
    const newDuration = snappedHeight / HOUR_HEIGHT;
    h.set(snappedHeight);
    onUpdate(event.id, event.startTime, newDuration);
  };

  // 카테고리별 색상
  const bgColors = {
    work: "bg-blue-100 border-blue-300 text-blue-800",
    personal: "bg-purple-100 border-purple-300 text-purple-800",
    health: "bg-green-100 border-green-300 text-green-800",
  };

  const privacyBadge =
    event.privacy_mode === "MASKED"
      ? {
          label: "마스킹",
          icon: EyeOff,
          className: "border-amber-200 bg-amber-50 text-amber-700",
        }
      : event.privacy_mode === "APP_ONLY"
        ? {
            label: "앱 전용",
            icon: Lock,
            className: "border-slate-200 bg-slate-100 text-slate-700",
          }
        : null;

  const PrivacyBadgeIcon = privacyBadge?.icon;

  return (
    <motion.div
      drag="y"
      dragConstraints={containerRef}
      dragElastic={0.05}
      dragMomentum={false}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      dragListener={!isResizing}
      style={{
        y,
        height: h,
        position: "absolute",
        left: "3.5rem",
        right: "1rem",
        zIndex: isDragging || isResizing ? 50 : 10,
      }}
      className={cn(
        "rounded-lg border shadow-sm transition-shadow group select-none",
        bgColors[event.category],
        (isDragging || isResizing) &&
          "shadow-xl ring-2 ring-offset-1 ring-blue-400 opacity-90 cursor-grabbing"
      )}
    >
      {/* 콘텐츠 */}
      <div className="p-2 h-full flex flex-col justify-between overflow-hidden">
        <div>
          <div className="flex items-center gap-1 text-xs font-semibold opacity-70 mb-0.5">
            <Clock size={12} />
            {formatTime(event.startTime)} -{" "}
            {formatTime(event.startTime + event.duration)}
          </div>
          {privacyBadge && PrivacyBadgeIcon && (
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                privacyBadge.className
              )}
            >
              <PrivacyBadgeIcon className="h-3 w-3" />
              {privacyBadge.label}
            </div>
          )}
          <p className="font-bold text-sm leading-tight truncate">
            {event.title}
          </p>
        </div>
      </div>

      {/* 리사이즈 핸들 */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 9999 }}
        dragElastic={0}
        dragMomentum={false}
        onDragStart={() => setIsResizing(true)}
        onDrag={(e, info) => handleResizeDrag(e, info)}
        onDragEnd={handleResizeEnd}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-0 left-0 w-full h-6 cursor-s-resize flex items-center justify-center hover:bg-black/5 active:bg-black/10 transition-colors rounded-b-lg touch-none"
      >
        <div className="w-10 h-1 bg-current opacity-30 rounded-full group-hover:h-1.5 transition-all flex items-center justify-center">
          <GripHorizontal
            size={14}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-current"
          />
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TimeTable;
