from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, now
from app.main import app
from app.models import Category, User
from app.security import attempts


@pytest.fixture
def setup(tmp_path):
    engine = create_engine(
        "sqlite:///" + str(tmp_path / "test.db"),
        connect_args={"check_same_thread": False, "timeout": 10},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)

    def override():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = override
    attempts.clear()
    with factory() as db:
        for kind in ["service", "vegetable", "vehicle"]:
            db.add(Category(name=kind.title(), kind=kind))
        db.commit()
    with TestClient(app) as client:
        yield client, factory
    app.dependency_overrides.clear()
    engine.dispose()


def account(client, email, roles=None):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Test Neighbour",
            "email": email,
            "password": "test-password-123",
            "roles": roles or ["customer"],
        },
    )
    assert response.status_code == 201, response.text
    return {"Authorization": "Bearer " + response.json()["token"]}


def business_listing(client, owner, kind, stock=10, price="100.00"):
    assert (
        client.put("/api/business", headers=owner, json={"name": "Local Test Business"}).status_code
        == 200
    )
    category = next(c for c in client.get("/api/categories").json() if c["kind"] == kind)
    response = client.post(
        "/api/business/listings",
        headers=owner,
        json={
            "kind": kind,
            "category_id": category["id"],
            "title": "Test " + kind,
            "description": "A real test listing for our local marketplace.",
            "price": price,
            "stock": stock,
            "unit": "day" if kind == "vehicle" else "kg" if kind == "vegetable" else "visit",
            "details": {
                "make": "Test",
                "model": "Car",
                "year": 2024,
                "capacity": 5,
                "pickup": "Main Road",
                "terms": "Test operator terms",
            }
            if kind == "vehicle"
            else {},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def booking(listing, delta=1):
    start = now() + timedelta(days=delta)
    return {
        "listing_id": listing["id"],
        "starts_at": start.isoformat() + "Z",
        "ends_at": (start + timedelta(hours=3)).isoformat() + "Z",
        "address": "Station Road pickup",
        "locality": "Mahabubabad",
    }


def test_auth_registration_login_logout_and_admin_protection(setup):
    client, factory = setup
    assert client.get("/api/me").status_code == 401
    assert (
        client.post(
            "/api/auth/register",
            json={
                "name": "Evil",
                "email": "evil@example.com",
                "password": "test-password-123",
                "roles": ["admin"],
            },
        ).status_code
        == 422
    )
    auth = account(client, "customer@example.com")
    assert client.get("/api/me", headers=auth).json()["roles"] == ["customer"]
    assert client.get("/api/admin/users", headers=auth).status_code == 403
    assert (
        client.patch("/api/me/business-roles", headers=auth, json={"roles": ["admin"]}).status_code
        == 422
    )
    assert (
        client.patch(
            "/api/me/business-roles", headers=auth, json={"roles": ["seller", "provider"]}
        ).status_code
        == 200
    )
    assert set(client.get("/api/me", headers=auth).json()["roles"]) == {
        "customer",
        "seller",
        "provider",
    }
    assert (
        client.post(
            "/api/auth/login", json={"email": "customer@example.com", "password": "wrong"}
        ).status_code
        == 401
    )
    result = client.post(
        "/api/auth/login", json={"email": "customer@example.com", "password": "test-password-123"}
    )
    assert result.status_code == 200
    assert client.post("/api/auth/logout", headers=auth).status_code == 200
    assert client.get("/api/me", headers=auth).status_code == 401


def test_service_workflow_permissions_review_and_notifications(setup):
    client, factory = setup
    provider = account(client, "provider@example.com", ["provider"])
    customer = account(client, "customer@example.com")
    stranger = account(client, "stranger@example.com")
    listing = business_listing(client, provider, "service")
    response = client.post("/api/bookings", headers=customer, json=booking(listing))
    assert response.status_code == 201, response.text
    identifier = response.json()["id"]
    route = f"/api/transactions/{identifier}"
    assert client.get(route, headers=stranger).status_code == 403
    assert (
        client.patch(route + "/status", headers=customer, json={"status": "completed"}).status_code
        == 400
    )
    assert (
        client.patch(route + "/status", headers=stranger, json={"status": "accepted"}).status_code
        == 403
    )
    for status in ["accepted", "in_progress", "completed"]:
        assert (
            client.patch(route + "/status", headers=provider, json={"status": status}).status_code
            == 200
        )
    review = {"transaction_id": identifier, "rating": 5, "comment": "Excellent local service"}
    assert client.post("/api/reviews", headers=customer, json=review).status_code == 201
    assert client.post("/api/reviews", headers=customer, json=review).status_code == 409
    assert client.get("/api/listings/" + str(listing["id"])).json()["rating"] == 5
    assert len(client.get("/api/notifications", headers=customer).json()) >= 4


def test_stock_totals_cancellation_and_privacy(setup):
    client, factory = setup
    seller = account(client, "seller@example.com", ["seller"])
    customer = account(client, "customer@example.com")
    stranger = account(client, "stranger@example.com")
    listing = business_listing(client, seller, "vegetable", stock=3, price="32.25")
    assert (
        client.put(
            "/api/cart", headers=customer, json={"listing_id": listing["id"], "quantity": 4}
        ).status_code
        == 409
    )
    assert (
        client.put(
            "/api/cart", headers=customer, json={"listing_id": listing["id"], "quantity": 3}
        ).status_code
        == 200
    )
    # Another customer reserves inventory before checkout: stale carts must fail safely.
    assert (
        client.put(
            "/api/cart", headers=stranger, json={"listing_id": listing["id"], "quantity": 2}
        ).status_code
        == 200
    )
    response = client.post(
        "/api/checkout",
        headers=customer,
        json={"address": "Main road 12345", "fulfillment": "delivery"},
    )
    assert response.status_code == 201, response.text
    order = response.json()
    assert Decimal(order["total"]) == Decimal("121.75")
    assert order["payment_status"] == "unpaid"
    assert client.get("/api/listings/" + str(listing["id"])).json()["stock"] == 0
    assert (
        client.post(
            "/api/checkout", headers=stranger, json={"address": "Main road 12345"}
        ).status_code
        == 409
    )
    assert client.get("/api/transactions/" + str(order["id"]), headers=stranger).status_code == 403
    assert (
        client.patch(
            f"/api/transactions/{order['id']}/status",
            headers=customer,
            json={"status": "cancelled"},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/transactions/{order['id']}/status",
            headers=customer,
            json={"status": "cancelled"},
        ).status_code
        == 400
    )
    assert client.get("/api/listings/" + str(listing["id"])).json()["stock"] == 3


def test_rental_estimate_and_confirmed_overlap(setup):
    client, factory = setup
    operator = account(client, "operator@example.com", ["operator"])
    customer = account(client, "customer@example.com")
    other = account(client, "other@example.com")
    listing = business_listing(client, operator, "vehicle", price="1800.00")
    body = booking(listing)
    assert (
        client.post("/api/bookings/estimate", headers=customer, json=body).json()["total"]
        == "1800.00"
    )
    first = client.post("/api/bookings", headers=customer, json=body).json()
    second = client.post("/api/bookings", headers=other, json=body).json()
    assert (
        client.patch(
            f"/api/transactions/{first['id']}/status", headers=operator, json={"status": "accepted"}
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/transactions/{second['id']}/status",
            headers=operator,
            json={"status": "accepted"},
        ).status_code
        == 409
    )
    assert client.post("/api/bookings", headers=other, json=body).status_code == 409
    for status in ["active", "returned"]:
        assert (
            client.patch(
                f"/api/transactions/{first['id']}/status", headers=operator, json={"status": status}
            ).status_code
            == 200
        )


def test_coverage_availability_ownership_and_address(setup):
    client, factory = setup
    provider = account(client, "provider@example.com", ["provider"])
    customer = account(client, "customer@example.com")
    listing = business_listing(client, provider, "service")
    body = booking(listing)
    body["locality"] = "Unsupported village"
    assert client.post("/api/bookings", headers=customer, json=body).status_code == 400
    assert (
        client.post(
            "/api/business/listings",
            headers=customer,
            json={
                "kind": "service",
                "category_id": 1,
                "title": "Fake listing",
                "description": "Unauthorized listing test",
                "price": "1",
            },
        ).status_code
        == 403
    )
    start = now() + timedelta(days=5)
    assert (
        client.post(
            f"/api/business/listings/{listing['id']}/availability",
            headers=provider,
            json={
                "starts_at": start.isoformat() + "Z",
                "ends_at": (start + timedelta(hours=5)).isoformat() + "Z",
            },
        ).status_code
        == 200
    )
    assert client.post("/api/bookings", headers=customer, json=booking(listing)).status_code == 409
    address = client.post(
        "/api/addresses", headers=customer, json={"label": "Home", "address": "Home at main street"}
    ).json()
    assert (
        client.delete("/api/addresses/" + str(address["id"]), headers=provider).status_code == 403
    )


def test_urgent_provider_confirmation_and_admin_moderation(setup):
    client, factory = setup
    provider = account(client, "provider@example.com", ["provider"])
    customer = account(client, "customer@example.com")
    admin = account(client, "admin@example.com")
    with factory() as db:
        user = db.scalar(select(User).where(User.email == "admin@example.com"))
        user.roles = "customer,admin"
        db.commit()
    listing = business_listing(client, provider, "service")
    request = client.post(
        "/api/bookings",
        headers=customer,
        json={"listing_id": listing["id"], "urgent": True, "address": "Main road 12345"},
    ).json()
    path = f"/api/transactions/{request['id']}/status"
    assert client.patch(path, headers=provider, json={"status": "accepted"}).status_code == 400
    assert (
        client.patch(
            path,
            headers=provider,
            json={
                "status": "accepted",
                "eta": "Tomorrow at the scheduled time",
                "starts_at": (now() + timedelta(days=1)).isoformat() + "Z",
            },
        ).status_code
        == 200
    )
    assert (
        client.post(f"/api/admin/listings/{listing['id']}/hide", headers=customer).status_code
        == 403
    )
    assert (
        client.post(f"/api/admin/listings/{listing['id']}/hide", headers=admin).status_code == 200
    )
    assert client.get("/api/listings/" + str(listing["id"])).status_code == 404
    assert len(client.get("/api/admin/audit", headers=admin).json()) == 1


def test_mixed_seller_cart_and_upload_validation(setup):
    client, factory = setup
    seller = account(client, "seller@example.com", ["seller"])
    other = account(client, "other@example.com", ["seller"])
    customer = account(client, "customer@example.com")
    first = business_listing(client, seller, "vegetable")
    second = business_listing(client, other, "vegetable")
    assert (
        client.put(
            "/api/cart", headers=customer, json={"listing_id": first["id"], "quantity": 1}
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/cart", headers=customer, json={"listing_id": second["id"], "quantity": 1}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/uploads",
            headers=seller,
            files={"file": ("unsafe.svg", b"<svg><script>bad()</script></svg>", "image/svg+xml")},
        ).status_code
        == 400
    )
    assert client.get("/api/health").status_code == 200


def test_concurrent_checkouts_cannot_oversell(setup):
    client, factory = setup
    seller = account(client, "seller@example.com", ["seller"])
    buyers = [account(client, f"buyer{n}@example.com") for n in range(2)]
    listing = business_listing(client, seller, "vegetable", stock=1)
    for buyer in buyers:
        assert (
            client.put(
                "/api/cart", headers=buyer, json={"listing_id": listing["id"], "quantity": 1}
            ).status_code
            == 200
        )
    barrier = Barrier(2)

    def buy(buyer):
        barrier.wait(timeout=10)
        return client.post(
            "/api/checkout", headers=buyer, json={"address": "Test address on Main Road"}
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(buy, buyers))
    assert sorted(statuses) == [201, 409]
    assert client.get("/api/listings/" + str(listing["id"])).json()["stock"] == 0


def test_concurrent_rental_acceptance_reserves_one_slot(setup):
    client, factory = setup
    operator = account(client, "operator@example.com", ["operator"])
    buyers = [account(client, f"buyer{n}@example.com") for n in range(2)]
    listing = business_listing(client, operator, "vehicle")
    body = booking(listing)
    requests = [
        client.post("/api/bookings", headers=buyer, json=body).json()["id"] for buyer in buyers
    ]
    barrier = Barrier(2)

    def accept(identifier):
        barrier.wait(timeout=10)
        return client.patch(
            f"/api/transactions/{identifier}/status", headers=operator, json={"status": "accepted"}
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(accept, requests))
    assert sorted(statuses) == [200, 409]


def test_database_outage_returns_a_safe_service_unavailable_response(setup):
    from sqlalchemy.exc import OperationalError

    client, factory = setup
    previous = app.dependency_overrides[get_db]

    def unavailable():
        raise OperationalError("private query", {}, RuntimeError("private connection details"))

    app.dependency_overrides[get_db] = unavailable
    try:
        response = client.get("/api/health")
        assert response.status_code == 503
        assert response.json() == {
            "detail": "The database is temporarily unavailable. Please try again shortly."
        }
        assert "private" not in response.text
    finally:
        app.dependency_overrides[get_db] = previous
