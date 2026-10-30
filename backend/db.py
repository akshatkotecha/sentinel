import os

import httpx
from supabase import ClientOptions, create_client

_client = None


def get_db():
    global _client

    if _client is None:
        # HTTP/1.1 on purpose: Flask serves each request on its own thread, and
        # a shared HTTP/2 connection fails under concurrent use with ReadError.
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SECRET_KEY"],
            options=ClientOptions(httpx_client=httpx.Client(http2=False, timeout=30))
        )

    return _client
