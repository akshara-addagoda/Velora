from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class Register(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=10, max_length=128)
    roles: list[Literal["customer", "provider", "seller", "operator"]] = ["customer"]


class Login(BaseModel):
    email: str
    password: str = Field(max_length=128)


class BusinessRolesInput(BaseModel):
    roles: list[Literal["provider", "seller", "operator"]]


class BusinessInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=3000)
    town: str = Field(default="Mahabubabad", min_length=2, max_length=100)
    localities: str = Field(default="Mahabubabad", min_length=2, max_length=1000)
    contact: str = Field(default="", max_length=100)
    delivery: bool = True
    pickup: bool = True
    cash_enabled: bool = True


class ListingInput(BaseModel):
    kind: Literal["service", "vegetable", "vehicle"]
    category_id: int
    title: str = Field(min_length=3, max_length=150)
    description: str = Field(min_length=10, max_length=5000)
    image: str = Field(default="", max_length=2000)
    price: Decimal = Field(ge=0, le=10000000, decimal_places=2)
    unit: Literal["visit", "hour", "day", "kg", "500 g", "250 g", "bunch", "piece"] = "visit"
    pricing_model: Literal["fixed", "hourly", "quotation"] = "fixed"
    stock: int = Field(default=0, ge=0, le=1000000)
    minimum: int = Field(default=1, ge=1, le=10000)
    active: bool = True
    details: dict = Field(default_factory=dict)

    @field_validator("image")
    @classmethod
    def safe_image(cls, value):
        if value and not value.startswith(("https://", "/api/uploads/")):
            raise ValueError("Use an HTTPS image URL or an uploaded image")
        return value


class BookingInput(BaseModel):
    listing_id: int
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    urgent: bool = False
    notes: str = Field(default="", max_length=2000)
    address: str = Field(min_length=3, max_length=1000)
    locality: str = Field(default="Mahabubabad", min_length=2, max_length=100)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def utc(cls, value):
        if value is not None:
            if value.tzinfo is None:
                raise ValueError("Include a timezone offset in booking dates")
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value


class CheckoutInput(BaseModel):
    address: str = Field(min_length=5, max_length=1000)
    locality: str = Field(default="Mahabubabad", min_length=2, max_length=100)
    fulfillment: Literal["delivery", "pickup"] = "delivery"
    notes: str = Field(default="", max_length=2000)


class CartInput(BaseModel):
    listing_id: int
    quantity: int = Field(ge=0, le=10000)


class StatusInput(BaseModel):
    status: str
    eta: str = Field(default="", max_length=100)
    starts_at: datetime | None = None

    @field_validator("starts_at")
    @classmethod
    def utc(cls, value):
        if value is not None:
            if value.tzinfo is None:
                raise ValueError("Include a timezone offset")
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value


class AddressInput(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    address: str = Field(min_length=5, max_length=1000)
    locality: str = Field(default="Mahabubabad", min_length=2, max_length=100)
    town: str = Field(default="Mahabubabad", min_length=2, max_length=100)
    pin: str = Field(default="", pattern=r"^([0-9]{6})?$")


class ReviewInput(BaseModel):
    transaction_id: int
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=3, max_length=2000)


class ReportInput(BaseModel):
    listing_id: int | None = None
    message: str = Field(min_length=10, max_length=3000)


class ProfileInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)


class AvailabilityInput(BaseModel):
    starts_at: datetime
    ends_at: datetime

    @field_validator("starts_at", "ends_at")
    @classmethod
    def utc(cls, value):
        if value.tzinfo is None:
            raise ValueError("Include a timezone offset")
        return value.astimezone(timezone.utc).replace(tzinfo=None)
