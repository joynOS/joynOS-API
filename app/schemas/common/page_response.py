from pydantic import BaseModel
from typing import List, Generic, TypeVar
from pydantic.generics import GenericModel

T = TypeVar("T")


class PageResponse(GenericModel, Generic[T]):
    page: int
    size: int
    total: int
    has_next: bool
    has_prev: bool
    items: List[T]
