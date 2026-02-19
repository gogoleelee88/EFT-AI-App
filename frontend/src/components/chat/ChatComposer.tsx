import type { KeyboardEvent } from 'react';

interface ChatComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onOpenSettings: () => void;
  disabled?: boolean;
}

export default function ChatComposer({
  draft,
  onDraftChange,
  onSend,
  onOpenSettings,
  disabled = false,
}: ChatComposerProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700">메시지 작성</div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          룸 설정
        </button>
      </div>
      <textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        rows={4}
        placeholder="보낼 문장을 입력하세요. Enter 전송, Shift+Enter 줄바꿈"
        className="w-full resize-y rounded-md border border-gray-300 p-2 text-sm outline-none focus:border-blue-500"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !draft.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          전송
        </button>
      </div>
    </div>
  );
}

