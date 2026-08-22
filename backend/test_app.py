from fastapi.testclient import TestClient

from backend.app import app, portfolio


client = TestClient(app)


def test_health_reports_ready_service():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["portfolio_loans"] == len(portfolio)


def test_model_metadata_is_available():
    response = client.get("/api/v1/models/active")
    assert response.status_code == 200
    body = response.json()
    assert body["champion"]
    assert body["features"]


def test_portfolio_and_stress_workflow():
    summary = client.get("/api/v1/portfolio/summary")
    assert summary.status_code == 200
    assert summary.json()["loans"] >= 0

    stress = client.post("/api/v1/stress/run", json={"pd_multiplier": 1.5, "lgd": 0.7})
    assert stress.status_code == 200
    assert stress.json()["stressed"]["expected_loss"] >= stress.json()["baseline"]["expected_loss"]


def test_batch_validation_enforces_application_limit():
    response = client.post("/api/v1/score/batch", json={"applications": []})
    assert response.status_code == 422