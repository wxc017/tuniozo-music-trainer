"""Minimal client for Blender's official MCP extension (Blender Lab, v1.0.0).

Protocol, read from the extension source at
  .../Blender/5.2/extensions/user_default/mcp/mcp_to_blender_server.py

  - TCP on 127.0.0.1:9876
  - requests and responses are NULL-BYTE-DELIMITED JSON (this is the bit that
    makes naive probes hang forever: without the trailing "\0" the server is
    still waiting for the rest of the message)
  - request:  {"type": "execute", "code": "<python>", "strict_json": false}
    the "strict_json" key is REQUIRED - omitting it returns an explicit
    "this is a bug in the tool that generated this code" error
  - response: {"status": "ok", "result": {...}, "stdout": "...", "stderr": "..."}
"""

import json
import socket

HOST, PORT = "127.0.0.1", 9876


class BlenderError(RuntimeError):
    pass


def run(code: str, timeout: float = 120.0) -> dict:
    """Execute `code` inside Blender and return the decoded response."""
    s = socket.create_connection((HOST, PORT), timeout=10)
    try:
        s.settimeout(timeout)
        payload = {"type": "execute", "code": code, "strict_json": False}
        s.sendall((json.dumps(payload) + "\0").encode("utf-8"))
        buf = b""
        while b"\0" not in buf:
            chunk = s.recv(65536)
            if not chunk:
                raise BlenderError("connection closed before a complete response")
            buf += chunk
    finally:
        s.close()
    resp = json.loads(buf[: buf.index(b"\0")].decode("utf-8"))
    if resp.get("status") != "ok":
        raise BlenderError(resp.get("message", resp))
    return resp


def sh(code: str, timeout: float = 120.0) -> str:
    """Execute and return stdout, raising on stderr — the common case."""
    r = run(code, timeout)
    err = (r.get("stderr") or "").strip()
    if err:
        raise BlenderError(err)
    return (r.get("stdout") or "").rstrip()


if __name__ == "__main__":
    import sys
    print(sh(sys.stdin.read()))
