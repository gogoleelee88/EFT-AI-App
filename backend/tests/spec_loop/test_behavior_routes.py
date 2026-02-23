def test_behavior_routes_registered():
    from backend.main import (\n        app,\n    )
    paths = {(route.path, tuple(sorted(getattr(route, "methods", [])))) for route in app.routes}
    assert ("/api/spec/behavior/candidates", ("POST",)) in paths
    assert ("/api/spec/behavior/questions", ("POST",)) in paths
    assert ("/api/spec/behavior/questions/{question_id}/answer", ("POST",)) in paths
    assert ("/api/spec/behavior/questions/{question_id}/dismiss", ("POST",)) in paths
    assert ("/api/spec/behavior/questions/expire", ("POST",)) in paths
    assert ("/api/spec/behavior/questions/pending", ("GET",)) in paths
    assert ("/api/spec/behavior/timeline", ("GET",)) in paths
    assert ("/api/spec/behavior/timeline/{segment_id}", ("PATCH",)) in paths
