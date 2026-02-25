from backend.focus.fusion_engine import FusionParams, compute_exit_score


def test_fusion_engine_scores_physical_exit():
    score, state, evidence = compute_exit_score(
        {
            "activity": {
                "idle_seconds": 400,
                "tab_hidden_seconds": 120,
                "window_blur_seconds": 120,
            },
            "camera_presence": {"present": False, "absent_seconds": 40},
        },
        planned_break=False,
        params=FusionParams(idle_threshold_seconds=180, camera_weight=3.0, window_size_seconds=600),
    )
    assert score >= 6
    assert state == "physical_exit"
    assert evidence["idle_over_threshold"] == 400


def test_fusion_engine_calendar_override():
    score, state, evidence = compute_exit_score(
        {
            "activity": {"idle_seconds": 10, "tab_hidden_seconds": 0, "window_blur_seconds": 0},
            "calendar": {"meeting_started": True},
        },
        planned_break=False,
        params=FusionParams(),
    )
    assert state == "context_switch"
    assert evidence["override"] == "calendar_meeting_started"
    assert score >= 0


def test_fusion_engine_planned_break_softens_physical_exit():
    score, state, evidence = compute_exit_score(
        {
            "activity": {
                "idle_seconds": 500,
                "tab_hidden_seconds": 100,
                "window_blur_seconds": 100,
            },
            "camera_presence": {"present": False, "absent_seconds": 40},
        },
        planned_break=True,
        params=FusionParams(),
    )
    assert score >= 6
    assert state == "paused"
    assert evidence["planned_break_softened"] is True

