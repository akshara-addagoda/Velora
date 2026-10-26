"""Idempotent sample catalogue. Never creates public or hardcoded login passwords."""

import json
import secrets
from decimal import Decimal

from sqlalchemy import select

from .database import SessionLocal, settings
from .models import Business, Category, Listing, User
from .security import passwords

SERVICE_CATEGORIES = [
    "Photography",
    "Makeup & hair",
    "Event decoration",
    "Electricians",
    "Plumbers",
    "Home cleaning",
    "Appliance repair",
    "Carpenters",
    "Painters",
    "Event planning",
    "Content creators",
    "Other services",
]


def seed():
    with SessionLocal() as db:
        for kind, names in [
            ("service", SERVICE_CATEGORIES),
            ("vegetable", ["Fresh vegetables", "Seasonal produce"]),
            ("vehicle", ["Hatchbacks", "Sedans", "SUVs", "Luxury cars", "Other vehicles"]),
        ]:
            for name in names:
                if not db.scalar(select(Category).where(Category.name == name)):
                    db.add(Category(name=name, kind=kind))
        db.flush()
        admin_password = settings.admin_password.get_secret_value()
        if settings.admin_email and admin_password:
            if len(admin_password) < 12:
                raise ValueError("Use at least 12 characters for ADMIN_PASSWORD")
            if not db.scalar(select(User).where(User.email == settings.admin_email.lower())):
                db.add(
                    User(
                        email=settings.admin_email.lower(),
                        name="Velora Administrator",
                        password_hash=passwords.hash(admin_password),
                        roles="customer,admin",
                    )
                )
        samples = [
            (
                "Mahabubabad Home Care",
                "provider",
                "service",
                "Electricians",
                "A little fix. A lot of peace of mind.",
                "Experienced local electricians for switches, fans, wiring and everyday repairs. Parts are quoted separately.",
                "350",
                "visit",
                "photo-1621905251189-08b45d6a269e",
                {},
            ),
            (
                "Lens & Light Studio",
                "provider",
                "service",
                "Photography",
                "Your moments, beautifully captured",
                "Portraits, celebrations and candid family photography by a local team. Includes a one-hour session; final package confirmed by the studio.",
                "1800",
                "hour",
                "photo-1452587925148-ce544e77e70d",
                {},
            ),
            (
                "Glow by Kavya",
                "provider",
                "service",
                "Makeup & hair",
                "Feel like your favourite self",
                "Thoughtful occasion makeup and hairstyling at your doorstep. Please share your event details when booking.",
                "1500",
                "visit",
                "photo-1487412947147-5cebf100ffc2",
                {},
            ),
            (
                "Mahabubabad Home Care",
                "provider",
                "service",
                "Plumbers",
                "Reliable plumbing, close to home",
                "Tap repairs, leaking pipes and bathroom fittings. The provider confirms parts and arrival estimates after your request.",
                "300",
                "visit",
                "photo-1607472586893-edb57bdc0e39",
                {},
            ),
            (
                "Mahabubabad Home Care",
                "provider",
                "service",
                "Home cleaning",
                "A fresh start for your home",
                "Careful home cleaning with a local team. Tell us your home size so we can confirm scope and timing.",
                "900",
                "visit",
                "photo-1581578731548-c64695cc6952",
                {},
            ),
            (
                "Celebration Co.",
                "provider",
                "service",
                "Event decoration",
                "Small celebrations. Big smiles.",
                "Balloon backdrops, birthday decor and simple event styling. Price is an indicative starting estimate; ask for a quotation.",
                "2500",
                "visit",
                "photo-1530103862676-de8c9debad1d",
                {},
            ),
            (
                "Rythu Fresh Market",
                "seller",
                "vegetable",
                "Fresh vegetables",
                "Farm-fresh tomatoes",
                "Ripe, locally sourced tomatoes. A kitchen essential, picked with care.",
                "32",
                "kg",
                "photo-1546094096-0df4bcaaa337",
                {},
            ),
            (
                "Rythu Fresh Market",
                "seller",
                "vegetable",
                "Fresh vegetables",
                "Fresh green chillies",
                "Bring a little heat to home cooking. Sold in 250 g portions.",
                "18",
                "250 g",
                "photo-1588252303782-cb80119abd6d",
                {},
            ),
            (
                "Rythu Fresh Market",
                "seller",
                "vegetable",
                "Fresh vegetables",
                "Everyday potatoes",
                "Versatile, fresh potatoes for curries, fries and family favourites.",
                "28",
                "kg",
                "photo-1518977676601-b53f82aba655",
                {},
            ),
            (
                "Rythu Fresh Market",
                "seller",
                "vegetable",
                "Seasonal produce",
                "Fresh carrots",
                "Crunchy carrots, perfect for salads, soups and a comforting halwa.",
                "48",
                "kg",
                "photo-1447175008436-054170c2e979",
                {},
            ),
            (
                "Rythu Fresh Market",
                "seller",
                "vegetable",
                "Fresh vegetables",
                "Red onions",
                "Fresh red onions for everyday cooking. Sold by the kilogram.",
                "35",
                "kg",
                "photo-1508747703725-719777637510",
                {},
            ),
            (
                "Rythu Fresh Market",
                "seller",
                "vegetable",
                "Seasonal produce",
                "Garden greens",
                "Seasonal leafy greens, freshly sourced and sold by the bunch.",
                "20",
                "bunch",
                "photo-1540420773420-3366772f4999",
                {},
            ),
            (
                "Town Wheels",
                "operator",
                "vehicle",
                "Hatchbacks",
                "Maruti Suzuki Swift",
                "An easy city companion for errands and short trips. Operator confirms driving licence requirements and pickup arrangements.",
                "1800",
                "day",
                "photo-1503376780353-7e6692767b70",
                {
                    "make": "Maruti Suzuki",
                    "model": "Swift",
                    "year": 2023,
                    "capacity": 5,
                    "transmission": "Manual",
                    "fuel": "Petrol",
                    "ac": True,
                    "driver": "Self-drive",
                    "deposit": 3000,
                    "included_km": 150,
                    "extra_km_price": 10,
                    "pickup": "Railway Station Road, Mahabubabad",
                    "terms": "Fuel excluded. Deposit refundable subject to operator inspection. Free cancellation while pending.",
                },
            ),
            (
                "Town Wheels",
                "operator",
                "vehicle",
                "Sedans",
                "Hyundai Aura with driver",
                "Comfortable local and outstation travel. Share your route with the operator before confirmation.",
                "2400",
                "day",
                "photo-1552519507-da3b142c6e3d",
                {
                    "make": "Hyundai",
                    "model": "Aura",
                    "year": 2022,
                    "capacity": 4,
                    "transmission": "Manual",
                    "fuel": "Diesel",
                    "ac": True,
                    "driver": "With driver",
                    "deposit": 1000,
                    "included_km": 200,
                    "extra_km_price": 12,
                    "pickup": "Bus Stand, Mahabubabad",
                    "terms": "Tolls and parking extra. Route and driver availability confirmed by operator.",
                },
            ),
            (
                "Town Wheels",
                "operator",
                "vehicle",
                "SUVs",
                "Toyota Innova Crysta",
                "Room for the whole family. Comfortable journeys with an experienced local driver.",
                "3800",
                "day",
                "photo-1519641471654-76ce0107ad1b",
                {
                    "make": "Toyota",
                    "model": "Innova Crysta",
                    "year": 2023,
                    "capacity": 7,
                    "transmission": "Manual",
                    "fuel": "Diesel",
                    "ac": True,
                    "driver": "With driver",
                    "deposit": 2000,
                    "included_km": 200,
                    "extra_km_price": 18,
                    "pickup": "Railway Station Road, Mahabubabad",
                    "terms": "Tolls, parking and driver overnight allowance extra when applicable.",
                },
            ),
        ]
        for name, role, kind, category, title, description, price, unit, photo, details in samples:
            business = db.scalar(select(Business).where(Business.name == name))
            if not business:
                user = User(
                    email=name.lower().replace(" ", "").replace("&", "") + "@sample.velora.invalid",
                    name=name,
                    password_hash=passwords.hash(secrets.token_urlsafe(40)),
                    roles="customer," + role,
                )
                db.add(user)
                db.flush()
                business = Business(
                    owner_id=user.id,
                    name=name,
                    description="Sample local business for development. Create your own business account to test fulfillment.",
                    localities="Mahabubabad,Station Road,Bus Stand",
                    contact="",
                    verified=False,
                )
                db.add(business)
                db.flush()
            if not db.scalar(select(Listing.id).where(Listing.title == title)):
                category_row = db.scalar(select(Category).where(Category.name == category))
                db.add(
                    Listing(
                        business_id=business.id,
                        category_id=category_row.id,
                        kind=kind,
                        title=title,
                        description=description,
                        price=Decimal(price),
                        unit=unit,
                        stock=50 if kind == "vegetable" else 0,
                        image=f"https://images.unsplash.com/{photo}?auto=format&fit=crop&w=1000&q=85",
                        details=json.dumps(details),
                        pricing_model="quotation"
                        if category == "Event decoration"
                        else "hourly"
                        if unit == "hour"
                        else "fixed",
                    )
                )
        db.commit()
        print(
            "Seed complete. Sample business accounts have random, inaccessible passwords. Register your own test accounts."
        )


if __name__ == "__main__":
    seed()
