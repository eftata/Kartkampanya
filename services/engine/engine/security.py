import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from engine.settings import Settings, get_settings

_bearer = HTTPBearer(auto_error=False)


def require_engine_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """`Authorization: Bearer <ENGINE_TOKEN>` ister. Anahtar tanımlı değilse kapalı kalır."""
    expected = settings.engine_token.get_secret_value()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ENGINE_TOKEN is not configured",
        )
    if credentials is None or not secrets.compare_digest(
        credentials.credentials.encode(), expected.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing engine token",
            headers={"WWW-Authenticate": "Bearer"},
        )
