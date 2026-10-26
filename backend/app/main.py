import json
import math
import secrets
from datetime import timedelta
from decimal import ROUND_UP, Decimal, InvalidOperation
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError

from .database import get_db, now, settings
from .models import (
    Address,
    Audit,
    Availability,
    Business,
    CartItem,
    Category,
    Favourite,
    Listing,
    Notification,
    OrderItem,
    Payment,
    Report,
    Review,
    Session,
    Transaction,
    User,
)
from .schemas import (
    AddressInput,
    AvailabilityInput,
    BookingInput,
    BusinessInput,
    BusinessRolesInput,
    CartInput,
    CheckoutInput,
    ListingInput,
    Login,
    ProfileInput,
    Register,
    ReportInput,
    ReviewInput,
    StatusInput,
)
from .security import (
    admin_user,
    current_user,
    issue_session,
    passwords,
    public_user,
    rate_limit,
    token_digest,
)

app = FastAPI(title="Velora Marketplace API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
UPLOADS = Path(__file__).parents[1] / "uploads"
UPLOADS.mkdir(exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=UPLOADS), name="uploads")


@app.exception_handler(IntegrityError)
async def integrity_error(request, exc):
    return JSONResponse(
        status_code=409,
        content={"detail": "This record conflicts with an existing record. Refresh and try again."},
    )


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


def require_record(db, model, identifier):
    record = db.get(model, identifier)
    if record is None:
        raise HTTPException(404, "Record not found")
    return record


def business_for(db, user):
    business = db.scalar(select(Business).where(Business.owner_id == user.id))
    if not business:
        raise HTTPException(400, "Create your business profile first")
    return business


def visible(db, listing):
    business = db.get(Business, listing.business_id)
    return listing.active and not db.get(User, business.owner_id).suspended


def own_listing(db, user, identifier):
    listing = require_record(db, Listing, identifier)
    if db.get(Business, listing.business_id).owner_id != user.id:
        raise HTTPException(403, "You do not own this listing")
    return listing


def money(value):
    return Decimal(value).quantize(Decimal("0.01"))


def notify(db, user_id, message):
    db.add(Notification(user_id=user_id, message=message))


def public_business(business):
    return {
        k: getattr(business, k)
        for k in [
            "id",
            "name",
            "description",
            "town",
            "localities",
            "verified",
            "delivery",
            "pickup",
            "cash_enabled",
        ]
    }


def listing_json(db, listing):
    business = db.get(Business, listing.business_id)
    rating, count = db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(
            Review.business_id == business.id
        )
    ).one()
    details = json.loads(listing.details)
    details.pop("registration", None)
    return {
        **{
            k: getattr(listing, k)
            for k in [
                "id",
                "kind",
                "category_id",
                "title",
                "description",
                "image",
                "unit",
                "pricing_model",
                "stock",
                "minimum",
                "active",
            ]
        },
        "price": str(listing.price),
        "details": details,
        "business": public_business(business),
        "rating": round(rating, 1) if rating else None,
        "review_count": count,
    }


def transaction_json(db, transaction):
    listing = db.get(Listing, transaction.listing_id) if transaction.listing_id else None
    business = db.get(Business, transaction.business_id)
    payment = db.scalar(select(Payment).where(Payment.transaction_id == transaction.id))
    result = {c.name: getattr(transaction, c.name) for c in Transaction.__table__.columns}
    for key in ["subtotal", "delivery_fee", "deposit", "total", "commission", "provider_earnings"]:
        result[key] = str(result[key])
    result["title"] = listing.title if listing else "Fresh produce order"
    result["business"] = public_business(business)
    result["contact"] = (
        business.contact if transaction.status not in ["requested", "rejected", "cancelled"] else ""
    )
    result["items"] = [
        {
            **{k: getattr(item, k) for k in ["listing_id", "title", "quantity"]},
            "price": str(item.price),
        }
        for item in db.scalars(select(OrderItem).where(OrderItem.transaction_id == transaction.id))
    ]
    result["payment_status"] = payment.status if payment else "unpaid"
    result["payment_mode"] = payment.mode if payment else "pay_direct"
    result["reviewed"] = (
        db.scalar(select(Review.id).where(Review.transaction_id == transaction.id)) is not None
    )
    return result


@app.get("/api/health")
def health(db=Depends(get_db)):
    db.execute(select(1))
    return {
        "status": "ok",
        "payments": "pay directly to participating provider; online gateway not configured",
    }


@app.post("/api/auth/register", status_code=201, dependencies=[Depends(rate_limit)])
def register(data: Register, db=Depends(get_db)):
    email = data.email.strip().lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account already uses this email")
    user = User(
        email=email,
        name=data.name.strip(),
        password_hash=passwords.hash(data.password),
        roles=",".join(sorted(set(["customer"] + data.roles))),
    )
    db.add(user)
    db.flush()
    return issue_session(db, user)


@app.post("/api/auth/login", dependencies=[Depends(rate_limit)])
def login(data: Login, db=Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    if not user or not passwords.verify(data.password, user.password_hash) or user.suspended:
        raise HTTPException(401, "Incorrect email or password, or account unavailable")
    return issue_session(db, user)


@app.post("/api/auth/logout")
def logout(request: Request, user=Depends(current_user), db=Depends(get_db)):
    db.execute(
        delete(Session).where(
            Session.token_hash == token_digest(request.headers["Authorization"][7:])
        )
    )
    db.commit()
    return {"message": "Signed out"}


@app.get("/api/me")
def me(user=Depends(current_user)):
    return public_user(user)


@app.patch("/api/me")
def update_profile(data: ProfileInput, user=Depends(current_user), db=Depends(get_db)):
    user.name = data.name
    db.commit()
    return public_user(user)


@app.get("/api/categories")
def categories(db=Depends(get_db)):
    return list(db.scalars(select(Category).order_by(Category.id)))


@app.patch("/api/me/business-roles")
def add_business_roles(data: BusinessRolesInput, user=Depends(current_user), db=Depends(get_db)):
    user.roles = ",".join(sorted(set(user.roles.split(",")) | set(data.roles)))
    db.commit()
    return public_user(user)


@app.get("/api/listings")
def listings(
    kind: str = "",
    q: str = "",
    category: int | None = None,
    locality: str = "",
    maximum: Decimal | None = None,
    minimum_rating: float = 0,
    available: bool = False,
    sort: str = "recommended",
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=60),
    db=Depends(get_db),
):
    statement = (
        select(Listing)
        .join(Business)
        .join(User, User.id == Business.owner_id)
        .where(Listing.active.is_(True), User.suspended.is_(False))
    )
    if kind:
        statement = statement.where(Listing.kind == kind)
    if q:
        statement = statement.where(
            (Listing.title + " " + Listing.description).ilike("%" + q[:100] + "%")
        )
    if category:
        statement = statement.where(Listing.category_id == category)
    if maximum is not None:
        statement = statement.where(Listing.price <= maximum)
    if locality:
        statement = statement.where(Business.localities.ilike("%" + locality[:100] + "%"))
    if available:
        statement = statement.where((Listing.kind != "vegetable") | (Listing.stock > 0))
    if minimum_rating:
        rated = (
            select(Review.business_id)
            .group_by(Review.business_id)
            .having(func.avg(Review.rating) >= minimum_rating)
        )
        statement = statement.where(Listing.business_id.in_(rated))
    total = db.scalar(select(func.count()).select_from(statement.subquery()))
    statement = statement.order_by(
        Listing.price.asc()
        if sort == "price_asc"
        else Listing.price.desc()
        if sort == "price_desc"
        else Listing.id.desc()
    )
    return {
        "items": [
            listing_json(db, item)
            for item in db.scalars(statement.offset((page - 1) * page_size).limit(page_size))
        ],
        "total": total,
        "page": page,
        "pages": math.ceil(total / page_size),
    }


@app.get("/api/listings/{identifier}")
def listing_detail(identifier: int, db=Depends(get_db)):
    listing = require_record(db, Listing, identifier)
    if not visible(db, listing):
        raise HTTPException(404, "Listing unavailable")
    result = listing_json(db, listing)
    result["reviews"] = list(
        db.scalars(select(Review).where(Review.business_id == listing.business_id))
    )
    result["availability"] = list(
        db.scalars(
            select(Availability).where(
                Availability.listing_id == identifier, Availability.ends_at > now()
            )
        )
    )
    return result


@app.get("/api/businesses/{identifier}")
def business_detail(identifier: int, db=Depends(get_db)):
    business = require_record(db, Business, identifier)
    if db.get(User, business.owner_id).suspended:
        raise HTTPException(404, "Business unavailable")
    return {
        **public_business(business),
        "listings": [
            listing_json(db, item)
            for item in db.scalars(
                select(Listing).where(Listing.business_id == identifier, Listing.active.is_(True))
            )
        ],
    }


@app.get("/api/business")
def my_business(user=Depends(current_user), db=Depends(get_db)):
    business = db.scalar(select(Business).where(Business.owner_id == user.id))
    return business


@app.put("/api/business")
def save_business(data: BusinessInput, user=Depends(current_user), db=Depends(get_db)):
    if not set(user.roles.split(",")) & {"provider", "seller", "operator"}:
        raise HTTPException(403, "A business role is required")
    business = db.scalar(select(Business).where(Business.owner_id == user.id))
    if business:
        for key, value in data.model_dump().items():
            setattr(business, key, value)
        business.verified = False
        business.verification_requested = True
    else:
        business = Business(owner_id=user.id, **data.model_dump())
        db.add(business)
    db.commit()
    return business


def validate_listing(data, user, db):
    role = {"service": "provider", "vegetable": "seller", "vehicle": "operator"}[data.kind]
    if role not in user.roles.split(","):
        raise HTTPException(403, f"{role.title()} role required")
    category = require_record(db, Category, data.category_id)
    if category.kind != data.kind:
        raise HTTPException(400, "Category does not match listing type")
    if data.kind == "vehicle" and data.unit not in ["hour", "day"]:
        raise HTTPException(400, "Vehicles must be priced per hour or day")
    if data.kind == "vegetable" and data.unit not in ["kg", "500 g", "250 g", "bunch", "piece"]:
        raise HTTPException(400, "Select a supported produce unit")
    if data.kind == "service" and data.unit not in ["visit", "hour"]:
        raise HTTPException(400, "Services must be priced per visit or hour")
    if data.kind != "service" and data.pricing_model != "fixed":
        raise HTTPException(400, "Produce and rentals use fixed unit pricing")
    if data.kind == "vehicle":
        for key in ["make", "model", "year", "capacity", "pickup", "terms"]:
            if not str(data.details.get(key, "")).strip():
                raise HTTPException(400, f"Vehicles require {key}")
    for key in ["deposit", "included_km", "extra_km_price", "capacity", "year"]:
        try:
            if key in data.details and (
                not Decimal(str(data.details[key])).is_finite()
                or Decimal(str(data.details[key])) < 0
                or Decimal(str(data.details[key])) > 10000000
            ):
                raise ValueError()
        except (InvalidOperation, ValueError, TypeError):
            raise HTTPException(400, f"Invalid {key}")
    if data.kind == "vehicle" and (
        not 1 <= Decimal(str(data.details["capacity"])) <= 100
        or not 1950 <= Decimal(str(data.details["year"])) <= 2100
    ):
        raise HTTPException(400, "Check the vehicle year and passenger capacity")
    if len(json.dumps(data.details)) > 12000:
        raise HTTPException(400, "Listing details are too long")


@app.get("/api/business/listings")
def my_listings(user=Depends(current_user), db=Depends(get_db)):
    business = business_for(db, user)
    return [
        listing_json(db, item)
        for item in db.scalars(select(Listing).where(Listing.business_id == business.id))
    ]


@app.post("/api/business/listings", status_code=201)
def create_listing(data: ListingInput, user=Depends(current_user), db=Depends(get_db)):
    validate_listing(data, user, db)
    values = data.model_dump()
    values["details"] = json.dumps(values["details"])
    listing = Listing(business_id=business_for(db, user).id, **values)
    db.add(listing)
    db.commit()
    return listing_json(db, listing)


@app.put("/api/business/listings/{identifier}")
def edit_listing(
    identifier: int, data: ListingInput, user=Depends(current_user), db=Depends(get_db)
):
    listing = own_listing(db, user, identifier)
    if data.kind != listing.kind:
        raise HTTPException(400, "A listing type cannot be changed")
    validate_listing(data, user, db)
    for key, value in data.model_dump().items():
        setattr(listing, key, json.dumps(value) if key == "details" else value)
    db.commit()
    return listing_json(db, listing)


@app.post("/api/business/listings/{identifier}/availability")
def add_availability(
    identifier: int, data: AvailabilityInput, user=Depends(current_user), db=Depends(get_db)
):
    own_listing(db, user, identifier)
    if data.ends_at <= data.starts_at or data.starts_at < now():
        raise HTTPException(400, "Choose a valid future availability window")
    slot = Availability(listing_id=identifier, **data.model_dump())
    db.add(slot)
    db.commit()
    return slot


@app.delete("/api/business/availability/{identifier}")
def delete_availability(identifier: int, user=Depends(current_user), db=Depends(get_db)):
    slot = require_record(db, Availability, identifier)
    own_listing(db, user, slot.listing_id)
    db.delete(slot)
    db.commit()
    return {"message": "Availability removed"}


@app.post("/api/uploads", status_code=201)
async def upload_image(file: UploadFile = File(...), user=Depends(current_user)):
    content = await file.read(5 * 1024 * 1024 + 1)
    extension = (
        ".png"
        if content.startswith(b"\x89PNG\r\n\x1a\n")
        else ".jpg"
        if content.startswith(b"\xff\xd8\xff")
        else ".webp"
        if content.startswith(b"RIFF") and content[8:12] == b"WEBP"
        else None
    )
    if not extension or len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Upload a PNG, JPEG, or WebP image under 5 MB")
    filename = secrets.token_hex(20) + extension
    (UPLOADS / filename).write_bytes(content)
    return {"url": "/api/uploads/" + filename}


def coverage(business, locality):
    if locality.strip().casefold() not in [
        value.strip().casefold() for value in business.localities.split(",")
    ]:
        raise HTTPException(400, "This business does not serve the selected locality")


def lock_listing(db, identifier):
    # A write lock serializes confirmation and stock changes on SQLite and PostgreSQL.
    db.execute(update(Listing).where(Listing.id == identifier).values(active=Listing.active))
    return db.scalar(
        select(Listing).where(Listing.id == identifier).execution_options(populate_existing=True)
    )


def check_conflict(db, listing_id, start, end, exclude=None):
    conflict = select(Transaction.id).where(
        Transaction.listing_id == listing_id,
        Transaction.status.in_(["accepted", "in_progress", "active"]),
        Transaction.starts_at < end,
        Transaction.ends_at > start,
    )
    if exclude:
        conflict = conflict.where(Transaction.id != exclude)
    if db.scalar(conflict):
        raise HTTPException(409, "This time overlaps an accepted booking. Choose another time.")


def estimate(db, data):
    listing = require_record(db, Listing, data.listing_id)
    if listing.kind not in ["service", "vehicle"] or not visible(db, listing):
        raise HTTPException(400, "This listing cannot be booked")
    business = db.get(Business, listing.business_id)
    coverage(business, data.locality)
    if not business.cash_enabled:
        raise HTTPException(
            400,
            "Online payments are not configured and this provider has not enabled direct payment",
        )
    if listing.kind == "vehicle" or not data.urgent:
        if not data.starts_at or data.starts_at <= now():
            raise HTTPException(400, "Select a future date and time")
    if listing.kind == "vehicle" and not data.ends_at:
        raise HTTPException(400, "A return time is required")
    start = data.starts_at
    end = data.ends_at or (start + timedelta(hours=1) if start else None)
    if start and (not end or end <= start):
        raise HTTPException(400, "Return/end time must follow the start time")
    units = Decimal("1")
    if listing.unit in ["hour", "day"] and start and end:
        units = Decimal(
            str((end - start).total_seconds() / (86400 if listing.unit == "day" else 3600))
        ).to_integral_value(rounding=ROUND_UP)
    if units < listing.minimum:
        raise HTTPException(400, f"Minimum duration: {listing.minimum} {listing.unit}(s)")
    if start:
        windows = list(
            db.scalars(select(Availability).where(Availability.listing_id == listing.id))
        )
        if windows and not any(
            window.starts_at <= start and window.ends_at >= end for window in windows
        ):
            raise HTTPException(409, "Choose a time within the published availability windows")
        check_conflict(db, listing.id, start, end)
    subtotal = money(listing.price * units)
    deposit = (
        money(str(json.loads(listing.details).get("deposit", 0)))
        if listing.kind == "vehicle"
        else money(0)
    )
    return listing, business, start, end, subtotal, deposit, units


@app.post("/api/bookings/estimate")
def booking_estimate(data: BookingInput, user=Depends(current_user), db=Depends(get_db)):
    listing, business, start, end, subtotal, deposit, units = estimate(db, data)
    return {
        "subtotal": str(subtotal),
        "deposit": str(deposit),
        "total": str(subtotal + deposit),
        "units": int(units),
        "pricing_model": listing.pricing_model,
        "payment_mode": "pay_direct",
        "notice": "Quotation prices are indicative. Availability and arrival time require provider acceptance.",
    }


def make_transaction(
    db, user, business, kind, subtotal, fee=Decimal(0), deposit=Decimal(0), **kwargs
):
    commission = money(subtotal * settings.commission_percent / 100)
    transaction = Transaction(
        customer_id=user.id,
        business_id=business.id,
        kind=kind,
        subtotal=subtotal,
        delivery_fee=fee,
        deposit=deposit,
        total=subtotal + fee + deposit,
        commission=commission,
        provider_earnings=subtotal - commission + fee,
        **kwargs,
    )
    db.add(transaction)
    db.flush()
    db.add(Payment(transaction_id=transaction.id))
    notify(db, business.owner_id, f"New {kind} request #{transaction.id}")
    notify(db, user.id, f"Your {kind} request #{transaction.id} was submitted")
    return transaction


@app.post("/api/bookings", status_code=201)
def create_booking(data: BookingInput, user=Depends(current_user), db=Depends(get_db)):
    lock_listing(db, data.listing_id)
    listing, business, start, end, subtotal, deposit, units = estimate(db, data)
    if business.owner_id == user.id:
        raise HTTPException(400, "You cannot book your own listing")
    transaction = make_transaction(
        db,
        user,
        business,
        listing.kind,
        subtotal,
        deposit=deposit,
        listing_id=listing.id,
        starts_at=start,
        ends_at=end,
        urgent=data.urgent,
        notes=data.notes,
        address=data.address,
        locality=data.locality,
    )
    db.commit()
    return transaction_json(db, transaction)


@app.get("/api/cart")
def get_cart(user=Depends(current_user), db=Depends(get_db)):
    return [
        {"listing": listing_json(db, db.get(Listing, item.listing_id)), "quantity": item.quantity}
        for item in db.scalars(select(CartItem).where(CartItem.user_id == user.id))
    ]


@app.put("/api/cart")
def update_cart(data: CartInput, user=Depends(current_user), db=Depends(get_db)):
    listing = require_record(db, Listing, data.listing_id)
    if listing.kind != "vegetable":
        raise HTTPException(400, "Only produce can be added to your cart")
    item = db.scalar(
        select(CartItem).where(CartItem.user_id == user.id, CartItem.listing_id == listing.id)
    )
    if data.quantity == 0:
        if item:
            db.delete(item)
    else:
        if (
            not visible(db, listing)
            or data.quantity > listing.stock
            or data.quantity < listing.minimum
        ):
            raise HTTPException(
                409, f"Choose a quantity between {listing.minimum} and {listing.stock}"
            )
        existing = db.scalar(
            select(CartItem)
            .join(Listing)
            .where(CartItem.user_id == user.id, Listing.business_id != listing.business_id)
        )
        if existing:
            raise HTTPException(
                400, "Checkout supports one shop at a time. Empty your cart before changing shops."
            )
        if item:
            item.quantity = data.quantity
        else:
            db.add(CartItem(user_id=user.id, listing_id=listing.id, quantity=data.quantity))
    db.commit()
    return {"message": "Cart updated"}


@app.post("/api/checkout", status_code=201)
def checkout(data: CheckoutInput, user=Depends(current_user), db=Depends(get_db)):
    db.execute(update(User).where(User.id == user.id).values(name=User.name))
    items = list(
        db.scalars(
            select(CartItem).where(CartItem.user_id == user.id).order_by(CartItem.listing_id)
        )
    )
    if not items:
        raise HTTPException(400, "Your cart is empty")
    products = [lock_listing(db, item.listing_id) for item in items]
    if len({product.business_id for product in products}) != 1:
        raise HTTPException(400, "Please order from one shop at a time")
    business = db.get(Business, products[0].business_id)
    if business.owner_id == user.id:
        raise HTTPException(400, "You cannot order from your own shop")
    if not business.cash_enabled or not getattr(business, data.fulfillment):
        raise HTTPException(400, "This fulfillment or direct payment option is unavailable")
    coverage(business, data.locality)
    subtotal = Decimal(0)
    for item, product in zip(items, products):
        if (
            not visible(db, product)
            or item.quantity > product.stock
            or item.quantity < product.minimum
        ):
            raise HTTPException(409, f"{product.title} has insufficient stock or is unavailable")
        changed = db.execute(
            update(Listing)
            .where(Listing.id == product.id, Listing.stock >= item.quantity)
            .values(stock=Listing.stock - item.quantity)
        )
        if changed.rowcount != 1:
            raise HTTPException(409, "Stock changed. Refresh your cart.")
        subtotal += product.price * item.quantity
    fee = Decimal(25) if data.fulfillment == "delivery" else Decimal(0)
    transaction = make_transaction(
        db,
        user,
        business,
        "vegetable",
        money(subtotal),
        fee=fee,
        address=data.address,
        locality=data.locality,
        notes=data.notes,
        fulfillment=data.fulfillment,
    )
    for item, product in zip(items, products):
        db.add(
            OrderItem(
                transaction_id=transaction.id,
                listing_id=product.id,
                title=product.title,
                quantity=item.quantity,
                price=product.price,
            )
        )
        db.delete(item)
    db.commit()
    return transaction_json(db, transaction)


@app.get("/api/transactions")
def my_transactions(business: bool = False, user=Depends(current_user), db=Depends(get_db)):
    condition = (
        Transaction.business_id == business_for(db, user).id
        if business
        else Transaction.customer_id == user.id
    )
    return [
        transaction_json(db, item)
        for item in db.scalars(select(Transaction).where(condition).order_by(Transaction.id.desc()))
    ]


@app.get("/api/transactions/{identifier}")
def transaction_detail(identifier: int, user=Depends(current_user), db=Depends(get_db)):
    transaction = require_record(db, Transaction, identifier)
    if (
        transaction.customer_id != user.id
        and db.get(Business, transaction.business_id).owner_id != user.id
        and "admin" not in user.roles.split(",")
    ):
        raise HTTPException(403, "This transaction belongs to another account")
    return transaction_json(db, transaction)


TRANSITIONS = {
    "service": {
        "requested": ["accepted", "rejected"],
        "accepted": ["in_progress", "cancelled"],
        "in_progress": ["completed"],
    },
    "vegetable": {
        "requested": ["accepted", "rejected"],
        "accepted": ["preparing", "cancelled"],
        "preparing": ["ready", "out_for_delivery"],
        "ready": ["delivered"],
        "out_for_delivery": ["delivered"],
    },
    "vehicle": {
        "requested": ["accepted", "rejected"],
        "accepted": ["active", "cancelled"],
        "active": ["returned"],
    },
}


@app.patch("/api/transactions/{identifier}/status")
def change_status(
    identifier: int, data: StatusInput, user=Depends(current_user), db=Depends(get_db)
):
    transaction = require_record(db, Transaction, identifier)
    # Lock the transaction too: simultaneous accept/cancel must restore stock once.
    db.execute(
        update(Transaction).where(Transaction.id == identifier).values(status=Transaction.status)
    )
    db.refresh(transaction)
    business = db.get(Business, transaction.business_id)
    if transaction.customer_id == user.id:
        if data.status != "cancelled" or transaction.status != "requested":
            raise HTTPException(400, "Customers can cancel pending requests only")
    elif business.owner_id == user.id:
        if data.status not in TRANSITIONS[transaction.kind].get(transaction.status, []):
            raise HTTPException(400, "This status transition is not allowed")
        if (
            transaction.kind == "vegetable"
            and data.status in ["ready", "out_for_delivery"]
            and data.status
            != ("ready" if transaction.fulfillment == "pickup" else "out_for_delivery")
        ):
            raise HTTPException(400, "Status does not match the fulfillment option")
    else:
        raise HTTPException(403, "You cannot update this transaction")
    if data.status == "accepted" and transaction.listing_id:
        listing = lock_listing(db, transaction.listing_id)
        if not visible(db, listing):
            raise HTTPException(409, "Listing is unavailable")
        if not transaction.starts_at:
            if not data.starts_at or data.starts_at <= now() or not data.eta.strip():
                raise HTTPException(
                    400, "Supply a future start time and arrival estimate for this urgent request"
                )
            transaction.starts_at = data.starts_at
            transaction.ends_at = data.starts_at + timedelta(hours=1)
        if transaction.starts_at <= now():
            raise HTTPException(
                409, "The requested start time has passed. Ask the customer to request a new time."
            )
        windows = list(
            db.scalars(select(Availability).where(Availability.listing_id == listing.id))
        )
        if windows and not any(
            w.starts_at <= transaction.starts_at and w.ends_at >= transaction.ends_at
            for w in windows
        ):
            raise HTTPException(409, "The requested time is outside your current availability")
        check_conflict(
            db, transaction.listing_id, transaction.starts_at, transaction.ends_at, identifier
        )
    if data.status in ["cancelled", "rejected"] and transaction.kind == "vegetable":
        for item in db.scalars(
            select(OrderItem)
            .where(OrderItem.transaction_id == identifier)
            .order_by(OrderItem.listing_id)
        ):
            db.execute(
                update(Listing)
                .where(Listing.id == item.listing_id)
                .values(stock=Listing.stock + item.quantity)
            )
    transaction.status = data.status
    if business.owner_id == user.id:
        transaction.eta = data.eta
    notify(
        db,
        transaction.customer_id,
        f"{transaction.kind.title()} #{identifier}: {data.status.replace('_', ' ')}",
    )
    notify(db, business.owner_id, f"Request #{identifier}: {data.status.replace('_', ' ')}")
    db.commit()
    return transaction_json(db, transaction)


@app.get("/api/addresses")
def addresses(user=Depends(current_user), db=Depends(get_db)):
    return list(db.scalars(select(Address).where(Address.user_id == user.id)))


@app.post("/api/addresses", status_code=201)
def save_address(data: AddressInput, user=Depends(current_user), db=Depends(get_db)):
    address = Address(user_id=user.id, **data.model_dump())
    db.add(address)
    db.commit()
    return address


@app.delete("/api/addresses/{identifier}")
def delete_address(identifier: int, user=Depends(current_user), db=Depends(get_db)):
    address = require_record(db, Address, identifier)
    if address.user_id != user.id:
        raise HTTPException(403, "This address belongs to another account")
    db.delete(address)
    db.commit()
    return {"message": "Address deleted"}


@app.get("/api/favourites")
def favourites(user=Depends(current_user), db=Depends(get_db)):
    return [
        listing_json(db, item)
        for item in db.scalars(select(Listing).join(Favourite).where(Favourite.user_id == user.id))
        if visible(db, item)
    ]


@app.put("/api/favourites/{identifier}")
def favourite(identifier: int, user=Depends(current_user), db=Depends(get_db)):
    require_record(db, Listing, identifier)
    record = db.scalar(
        select(Favourite).where(Favourite.user_id == user.id, Favourite.listing_id == identifier)
    )
    if record:
        db.delete(record)
    else:
        db.add(Favourite(user_id=user.id, listing_id=identifier))
    db.commit()
    return {"message": "Saved listings updated"}


@app.post("/api/reviews", status_code=201)
def create_review(data: ReviewInput, user=Depends(current_user), db=Depends(get_db)):
    transaction = require_record(db, Transaction, data.transaction_id)
    if transaction.customer_id != user.id or transaction.status not in [
        "completed",
        "delivered",
        "returned",
    ]:
        raise HTTPException(403, "Only your completed transactions can be reviewed")
    review = Review(customer_id=user.id, business_id=transaction.business_id, **data.model_dump())
    db.add(review)
    db.commit()
    return review


@app.get("/api/notifications")
def notifications(user=Depends(current_user), db=Depends(get_db)):
    return list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.id.desc())
            .limit(100)
        )
    )


@app.post("/api/notifications/read")
def read_notifications(user=Depends(current_user), db=Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id).values(read=True))
    db.commit()
    return {"message": "Notifications marked as read"}


@app.post("/api/reports", status_code=201)
def create_report(data: ReportInput, user=Depends(current_user), db=Depends(get_db)):
    if data.listing_id:
        require_record(db, Listing, data.listing_id)
    report = Report(user_id=user.id, **data.model_dump())
    db.add(report)
    db.commit()
    return {"message": "Your report was submitted to the administrator", "id": report.id}


@app.get("/api/admin/{section}")
def admin_section(section: str, user=Depends(admin_user), db=Depends(get_db)):
    if section == "overview":
        return {
            "users": db.scalar(select(func.count(User.id))),
            "listings": db.scalar(select(func.count(Listing.id))),
            "transactions": db.scalar(select(func.count(Transaction.id))),
            "completed_value": db.scalar(
                select(func.coalesce(func.sum(Transaction.total), 0)).where(
                    Transaction.status.in_(["completed", "returned", "delivered"])
                )
            ),
        }
    if section == "users":
        return [public_user(item) for item in db.scalars(select(User).order_by(User.id))]
    if section == "listings":
        return [listing_json(db, item) for item in db.scalars(select(Listing))]
    if section in ["orders", "bookings"]:
        statement = select(Transaction).where(
            Transaction.kind == "vegetable"
            if section == "orders"
            else Transaction.kind != "vegetable"
        )
        return [transaction_json(db, item) for item in db.scalars(statement)]
    model = {"providers": Business, "categories": Category, "reports": Report, "audit": Audit}.get(
        section
    )
    if not model:
        raise HTTPException(404, "Unknown admin section")
    return list(db.scalars(select(model)))


@app.post("/api/admin/{section}/{identifier}/{action}")
def admin_action(
    section: str, identifier: int, action: str, user=Depends(admin_user), db=Depends(get_db)
):
    if section == "users" and action in ["suspend", "restore"]:
        target = require_record(db, User, identifier)
        if "admin" in target.roles.split(","):
            raise HTTPException(400, "Administrator accounts cannot be suspended here")
        target.suspended = action == "suspend"
        if target.suspended:
            db.execute(delete(Session).where(Session.user_id == identifier))
    elif section == "providers" and action in ["verify", "unverify"]:
        target = require_record(db, Business, identifier)
        target.verified = action == "verify"
        target.verification_requested = False
    elif section == "listings" and action in ["hide", "restore"]:
        require_record(db, Listing, identifier).active = action == "restore"
    elif section == "reports" and action == "resolve":
        require_record(db, Report, identifier).status = "resolved"
    else:
        raise HTTPException(400, "Unsupported admin action")
    db.add(Audit(actor_id=user.id, action=f"{section}/{identifier}/{action}"))
    db.commit()
    return {"message": "Administrative action saved"}


@app.post("/api/admin/categories", status_code=201)
def create_category(
    name: str = Query(min_length=2, max_length=100),
    kind: str = Query(pattern="^(service|vegetable|vehicle)$"),
    user=Depends(admin_user),
    db=Depends(get_db),
):
    category = Category(name=name, kind=kind)
    db.add(category)
    db.add(Audit(actor_id=user.id, action=f"Create category: {name}"))
    db.commit()
    return category
