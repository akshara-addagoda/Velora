"""Non-destructive HTTP checks against the running local application.

Creates clearly labelled synthetic records, hides its listings afterward, and never
deletes records, resets a database, makes a payment, or prints authentication tokens.
"""

import secrets
import sys
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from urllib.parse import urlsplit

import httpx


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173"
    if urlsplit(base).hostname not in {"127.0.0.1", "localhost"}:
        raise SystemExit("This development check runs against localhost only.")
    suffix = secrets.token_hex(5)
    accounts = []
    created = []
    owner = None
    with httpx.Client(base_url=base, timeout=15) as client:

        def request(method, path, body=None, auth=None, expected=200):
            response = client.request(method, "/api" + path, json=body, headers=auth or {})
            if response.status_code != expected:
                raise RuntimeError(
                    f"{method} {path} returned {response.status_code}; expected {expected}. No credentials are included in this error."
                )
            return response.json()

        def account(label, roles):
            result = request(
                "POST",
                "/auth/register",
                {
                    "name": "Local check " + label,
                    "email": f"local-check-{label}-{suffix}@example.invalid",
                    "password": secrets.token_urlsafe(24),
                    "roles": roles,
                },
                expected=201,
            )
            auth = {"Authorization": "Bearer " + result["token"]}
            accounts.append(auth)
            return auth

        def listing(kind, title, unit, price, **extra):
            category = next(item for item in categories if item["kind"] == kind)
            body = {
                "kind": kind,
                "category_id": category["id"],
                "title": title + " — local check " + suffix,
                "description": "Synthetic local integration check. Not a live business offering.",
                "unit": unit,
                "price": price,
                "active": True,
                **extra,
            }
            result = request("POST", "/business/listings", body, owner, 201)
            created.append((result["id"], body))
            return result

        try:
            assert request("GET", "/health")["status"] == "ok"
            request("GET", "/me", expected=401)
            categories = request("GET", "/categories")
            assert request("GET", "/listings")["total"] >= 1
            owner = account("business", ["provider", "seller", "operator"])
            customer = account("customer", ["customer"])
            visitor = account("visitor", ["customer"])
            request(
                "PUT",
                "/business",
                {
                    "name": "Local integration check " + suffix,
                    "description": "Synthetic development check; not a live provider.",
                    "localities": "Mahabubabad",
                    "cash_enabled": True,
                },
                owner,
            )
            service = listing("service", "Test service", "visit", "350.00")
            produce = listing("vegetable", "Test produce", "kg", "32.25", stock=2)
            vehicle = listing(
                "vehicle",
                "Test vehicle",
                "day",
                "1800.00",
                details={
                    "make": "Test",
                    "model": "Vehicle",
                    "year": 2024,
                    "capacity": 5,
                    "pickup": "Test pickup location",
                    "terms": "Synthetic check only",
                    "deposit": 1000,
                },
            )
            print("PASS: registration, protected access, business roles and listing creation")

            start = datetime.now(UTC) + timedelta(days=2)
            booking = {
                "listing_id": service["id"],
                "starts_at": start.isoformat(),
                "ends_at": (start + timedelta(hours=1)).isoformat(),
                "address": "Synthetic test address",
                "locality": "Mahabubabad",
            }
            transaction = request("POST", "/bookings", booking, customer, 201)
            path = f"/transactions/{transaction['id']}"
            request("GET", path, auth=visitor, expected=403)
            request("PATCH", path + "/status", {"status": "completed"}, customer, 400)
            for status in ["accepted", "in_progress", "completed"]:
                request("PATCH", path + "/status", {"status": status}, owner)
            request(
                "POST",
                "/reviews",
                {
                    "transaction_id": transaction["id"],
                    "rating": 5,
                    "comment": "Synthetic development smoke check",
                },
                customer,
                201,
            )
            print("PASS: service request, ownership, completion and eligible review")

            request("PUT", "/cart", {"listing_id": produce["id"], "quantity": 3}, customer, 409)
            request("PUT", "/cart", {"listing_id": produce["id"], "quantity": 2}, customer)
            order = request(
                "POST",
                "/checkout",
                {
                    "address": "Synthetic test address",
                    "locality": "Mahabubabad",
                    "fulfillment": "delivery",
                },
                customer,
                201,
            )
            assert Decimal(order["total"]) == Decimal("89.50")
            assert order["payment_status"] == "unpaid"
            assert request("GET", f"/listings/{produce['id']}")["stock"] == 0
            request("GET", f"/transactions/{order['id']}", auth=visitor, expected=403)
            request(
                "PATCH", f"/transactions/{order['id']}/status", {"status": "cancelled"}, customer
            )
            assert request("GET", f"/listings/{produce['id']}")["stock"] == 2
            product_body = next(body for identifier, body in created if identifier == produce["id"])
            product_body["stock"] = 4
            assert (
                request("PUT", f"/business/listings/{produce['id']}", product_body, owner)["stock"]
                == 4
            )
            print(
                "PASS: produce stock validation, checkout totals, cancellation restoration and seller updates"
            )

            booking.update(
                listing_id=vehicle["id"], ends_at=(start + timedelta(hours=25)).isoformat()
            )
            estimate = request("POST", "/bookings/estimate", booking, customer)
            assert Decimal(estimate["total"]) == Decimal("4600.00")
            first = request("POST", "/bookings", booking, customer, 201)
            second = request("POST", "/bookings", booking, customer, 201)
            request("PATCH", f"/transactions/{first['id']}/status", {"status": "accepted"}, owner)
            request(
                "PATCH", f"/transactions/{second['id']}/status", {"status": "accepted"}, owner, 409
            )
            request("PATCH", f"/transactions/{second['id']}/status", {"status": "rejected"}, owner)
            for status in ["active", "returned"]:
                request("PATCH", f"/transactions/{first['id']}/status", {"status": status}, owner)
            assert request("GET", "/notifications", auth=customer)
            print(
                "PASS: rental estimate, confirmed overlap prevention, pickup/return and notifications"
            )
        finally:
            if owner:
                for identifier, body in created:
                    body["active"] = False
                    request("PUT", f"/business/listings/{identifier}", body, owner)
            for auth in accounts:
                request("POST", "/auth/logout", auth=auth)
                request("GET", "/me", auth=auth, expected=401)
        print(
            "PASS: logout invalidates sessions; synthetic listings are hidden. No records were deleted."
        )
        print("Local end-to-end HTTP verification passed.")


if __name__ == "__main__":
    main()
