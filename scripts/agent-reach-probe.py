"""Fixed, read-only Agent Reach channel probe used by the Worker."""

import json
import sys

from agent_reach.channels import get_channel
from agent_reach.config import Config


ALLOWED_CHANNELS = {"web"}


def main() -> int:
    channel_name = sys.argv[1] if len(sys.argv) == 2 else ""
    if channel_name not in ALLOWED_CHANNELS:
        print(json.dumps({"error": "channel_not_allowed"}))
        return 2

    channel = get_channel(channel_name)
    if channel is None:
        print(json.dumps({"error": "channel_not_found"}))
        return 3

    try:
        status, _message = channel.check(Config())
        result = {
            "channel": channel.name,
            "status": status,
            "active_backend": channel.active_backend,
        }
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception:
        print(
            json.dumps(
                {
                    "channel": channel_name,
                    "status": "error",
                    "active_backend": None,
                }
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
