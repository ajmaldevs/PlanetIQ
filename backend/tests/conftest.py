import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Pre-import core dependencies to ensure proper module registration in Python 3.14
import sqlalchemy
import sqlalchemy.dialects
import geoalchemy2

from app.core.config import settings

# For development test suite, permit demo fallback in development only
if not settings.IS_PRODUCTION:
    settings.ALLOW_DEMO_FALLBACK = True

# Ensure test admin API key is available for test suite runs
if not settings.ADMIN_API_KEY:
    settings.ADMIN_API_KEY = "test-admin-secret-key"
