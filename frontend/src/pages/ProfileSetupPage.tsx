import React, { useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  upsertAspirationProfile,
  upsertCapabilityProfile,
} from "../services/proposalService";

const splitLines = (input: string): string[] =>
  input
    .split(/\n|,/g)
    .map((v) => v.trim())
    .filter(Boolean);

const ProfileSetupPage: React.FC = () => {
  const { user } = useAuth();
  const userId = useMemo(() => user?.uid || "demo-user", [user?.uid]);

  const [aspirationStatement, setAspirationStatement] = useState("");
  const [targetIdentity, setTargetIdentity] = useState("");
  const [northStarGoal, setNorthStarGoal] = useState("");
  const [horizon90dText, setHorizon90dText] = useState("");
  const [valuesText, setValuesText] = useState("");
  const [constraintsText, setConstraintsText] = useState("");

  const [strengthsText, setStrengthsText] = useState("");
  const [experienceText, setExperienceText] = useState("");
  const [domainFocusText, setDomainFocusText] = useState("");
  const [certificationsText, setCertificationsText] = useState("");
  const [toolStackText, setToolStackText] = useState("");

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string>("");

  const handleSave = async () => {
    setSaving(true);
    setResult("");
    try {
      await upsertAspirationProfile({
        user_id: userId,
        aspiration_statement: aspirationStatement || "지속 가능한 실행력을 갖춘다.",
        target_identity: targetIdentity || undefined,
        north_star_goal: northStarGoal || undefined,
        horizon_90d: splitLines(horizon90dText),
        values: splitLines(valuesText),
        constraints: splitLines(constraintsText),
      });

      await upsertCapabilityProfile({
        user_id: userId,
        strengths: splitLines(strengthsText),
        experience_highlights: splitLines(experienceText),
        domain_focus: splitLines(domainFocusText),
        certifications: splitLines(certificationsText),
        tool_stack: splitLines(toolStackText),
      });
      setResult("저장 완료");
    } catch (e) {
      setResult(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Profile Setup</h1>
      <p className="text-sm text-gray-600">User ID: {userId}</p>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Aspiration Profile</h2>
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={3}
          placeholder="꿈/추구하는 나를 입력하세요"
          value={aspirationStatement}
          onChange={(e) => setAspirationStatement(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Target Identity"
          value={targetIdentity}
          onChange={(e) => setTargetIdentity(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="North Star Goal"
          value={northStarGoal}
          onChange={(e) => setNorthStarGoal(e.target.value)}
        />
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          placeholder="90일 목표 (줄바꿈/쉼표 구분)"
          value={horizon90dText}
          onChange={(e) => setHorizon90dText(e.target.value)}
        />
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          placeholder="핵심 가치 (줄바꿈/쉼표 구분)"
          value={valuesText}
          onChange={(e) => setValuesText(e.target.value)}
        />
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          placeholder="제약 조건 (줄바꿈/쉼표 구분)"
          value={constraintsText}
          onChange={(e) => setConstraintsText(e.target.value)}
        />
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Capability Profile</h2>
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          placeholder="강점"
          value={strengthsText}
          onChange={(e) => setStrengthsText(e.target.value)}
        />
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          placeholder="경력 하이라이트"
          value={experienceText}
          onChange={(e) => setExperienceText(e.target.value)}
        />
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          placeholder="도메인 포커스"
          value={domainFocusText}
          onChange={(e) => setDomainFocusText(e.target.value)}
        />
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          placeholder="자격/인증"
          value={certificationsText}
          onChange={(e) => setCertificationsText(e.target.value)}
        />
        <textarea
          className="w-full border rounded px-3 py-2"
          rows={2}
          placeholder="툴 스택"
          value={toolStackText}
          onChange={(e) => setToolStackText(e.target.value)}
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "저장 중..." : "프로필 저장"}
        </button>
        {result && <span className="text-sm text-gray-700">{result}</span>}
      </div>
    </div>
  );
};

export default ProfileSetupPage;
