import os
from dotenv import load_dotenv
from fastapi import APIRouter, Request, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth
from jose import jwt
from api.config import settings

load_dotenv()

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

router = APIRouter()

@router.get("/auth/login")
async def login_via_google(request: Request):
    if settings.environment == "development":
        redirect_uri = "http://localhost:3000/api/auth/callback"
    else:
        redirect_uri = "https://udo.endwaste.net/api/auth/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)

@router.get("/auth/callback")
async def auth_callback(request: Request, response: Response):
    # Exchange the authorization code for tokens
    token = await oauth.google.authorize_access_token(request)
    # Fetch user info using the token
    user_info = await oauth.google.userinfo(token=token)
    email = user_info["email"]

    # Use allowed_emails from env and allowed_domains hardcoded
    allowed_emails = settings.allowed_emails
    allowed_domains = ["endwaste.io"]

    if not any(email.endswith(f"@{domain.strip()}") for domain in allowed_domains if domain) and email not in allowed_emails:
        raise HTTPException(status_code=403, detail="Unauthorized Email")

    # Generate your app's JWT token using your secret
    jwt_token = jwt.encode({"email": email}, settings.jwt_secret, algorithm="HS256")

    if settings.environment == "development":
        redirect_url = "http://localhost:3000"
        secure_flag = False  # For HTTP in development
        cookie_domain = None  # Do not force a domain on localhost
    else:
        redirect_url = "https://udo.endwaste.net"
        secure_flag = True
        cookie_domain = "udo.endwaste.net"

    # Create a redirect response and set the cookie on it (with path set to "/")
    resp = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
    resp.set_cookie(
        key="token",
        value=jwt_token,
        httponly=True,
        secure=secure_flag,
        max_age=3600,
        samesite="strict",
        domain=cookie_domain,
        path="/"
    )
    return resp


@router.get("/auth/user")
async def get_user(request: Request):
    token = request.cookies.get("token")
    if token:
        try:
            data = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
            return {"email": data.get("email")}
        except Exception as e:
            raise HTTPException(status_code=401, detail="Invalid token")
    raise HTTPException(status_code=401, detail="Not authenticated")