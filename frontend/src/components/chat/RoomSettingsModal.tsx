import { useEffect, useMemo, useState } from 'react';

import type { BannedTone, Goal, ImageGoal, Relationship, RoomDefaults, SendPolicy } from '@/types/chat';

interface RoomSettingsModalProps {
  open: boolean;
  defaults: RoomDefaults;
  onClose: () => void;
  onSave: (value: RoomDefaults) => Promise<void> | void;
}

const RELATIONSHIP_OPTIONS: Relationship[] = [
  'boss',
  'peer',
  'client',
  'friend',
  'family',
  'stranger',
  'romance_interest',
];
const GOAL_OPTIONS: Goal[] = ['request', 'refuse', 'negotiate', 'maintain', 'deescalate'];
const IMAGE_GOAL_OPTIONS: ImageGoal[] = ['professional', 'kind', 'firm_polite', 'leaderlike', 'humble', 'relaxed'];
const BANNED_TONE_OPTIONS: BannedTone[] = ['blame', 'over_apology', 'excuses', 'emotional_outburst'];
const SEND_POLICY_OPTIONS: SendPolicy[] = ['prefer_fast', 'prefer_calm', 'prefer_boundary'];

const SEND_POLICY_LABEL: Record<SendPolicy, string> = {
  prefer_fast: '빠르게 전송 선호',
  prefer_calm: '차분한 전송 선호',
  prefer_boundary: '경계선 명확화 선호',
};

interface LocalState {
  relationship: Relationship;
  goal: Goal;
  image_goal: ImageGoal[];
  banned_tones: BannedTone[];
  default_send_policy: SendPolicy;
}

export default function RoomSettingsModal({ open, defaults, onClose, onSave }: RoomSettingsModalProps) {
  const [state, setState] = useState<LocalState>({
    relationship: defaults.relationship,
    goal: defaults.goal,
    image_goal: defaults.image_goal,
    banned_tones: defaults.banned_tones,
    default_send_policy: defaults.default_send_policy,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setState({
      relationship: defaults.relationship,
      goal: defaults.goal,
      image_goal: defaults.image_goal,
      banned_tones: defaults.banned_tones,
      default_send_policy: defaults.default_send_policy,
    });
  }, [defaults, open]);

  const canSave = useMemo(() => state.image_goal.length > 0, [state.image_goal.length]);

  if (!open) return null;

  const toggleImageGoal = (target: ImageGoal) => {
    setState((prev) => {
      const has = prev.image_goal.includes(target);
      return {
        ...prev,
        image_goal: has ? prev.image_goal.filter((item) => item !== target) : [...prev.image_goal, target],
      };
    });
  };

  const toggleBannedTone = (target: BannedTone) => {
    setState((prev) => {
      const has = prev.banned_tones.includes(target);
      return {
        ...prev,
        banned_tones: has ? prev.banned_tones.filter((item) => item !== target) : [...prev.banned_tones, target],
      };
    });
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave({ ...state, language: 'ko' });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-3">
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4">
        <div className="mb-3 text-lg font-semibold">룸 기본값 설정</div>

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-gray-700">관계</span>
            <select
              className="w-full rounded-md border border-gray-300 p-2"
              value={state.relationship}
              onChange={(event) => setState((prev) => ({ ...prev, relationship: event.target.value as Relationship }))}
            >
              {RELATIONSHIP_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-gray-700">목표</span>
            <select
              className="w-full rounded-md border border-gray-300 p-2"
              value={state.goal}
              onChange={(event) => setState((prev) => ({ ...prev, goal: event.target.value as Goal }))}
            >
              {GOAL_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div className="mb-1 text-gray-700">이미지 목표</div>
            <div className="grid grid-cols-2 gap-1">
              {IMAGE_GOAL_OPTIONS.map((item) => (
                <label key={item} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1">
                  <input
                    type="checkbox"
                    checked={state.image_goal.includes(item)}
                    onChange={() => toggleImageGoal(item)}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-gray-700">금지 톤</div>
            <div className="grid grid-cols-2 gap-1">
              {BANNED_TONE_OPTIONS.map((item) => (
                <label key={item} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1">
                  <input
                    type="checkbox"
                    checked={state.banned_tones.includes(item)}
                    onChange={() => toggleBannedTone(item)}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-gray-700">기본 전송 정책</span>
            <select
              className="w-full rounded-md border border-gray-300 p-2"
              value={state.default_send_policy}
              onChange={(event) =>
                setState((prev) => ({ ...prev, default_send_policy: event.target.value as SendPolicy }))
              }
            >
              {SEND_POLICY_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {SEND_POLICY_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
