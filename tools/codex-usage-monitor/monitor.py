#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
monitor.py — Claude Code / Codex ライブ残量モニタ
==================================================

Claude と Codex の「レート残量（5時間枠・週枠）」を一定間隔で取得して state.json に書き、
同時に live_dashboard.html を localhost で配信する。ブラウザは state.json を自動取得して
残り％・リセットまでの残り時間を常時表示する。標準ライブラリのみで動く。

使い方:
    python monitor.py                 # 取得しながら http://localhost:8787 で配信
    python monitor.py --once          # 1回だけ取得して state.json を書いて終了
    python monitor.py --demo          # サンプル state.json を出して配信（動作確認用）
    python monitor.py --port 9000 --interval 60

取得元（いずれも非公開・非保証のエンドポイント。CLIのバージョンで変わりうる）:
    Claude : GET https://api.anthropic.com/api/oauth/usage
             token = ~/.claude/.credentials.json の claudeAiOauth.accessToken
             （macOSはkeychain / 環境変数 CLAUDE_OAUTH_TOKEN でも上書き可）
    Codex  : `codex app-server` に initialize → account/rateLimits/read を JSON-RPC

拡張方法:
    PROVIDERS に「provider dict を返す関数」を追加するだけで対象を増やせる。
"""

import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE_PATH = HERE / "state.json"
MIN_INTERVAL = 55  # Claude usage は高頻度で 429 になるため最短間隔
CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage"

_cache = {"last_fetch": 0.0, "claude": None, "codex": None}
_lock = threading.Lock()


# ---------------------------------------------------------------------------
# 共通ヘルパ
# ---------------------------------------------------------------------------
def now_iso():
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def epoch_to_iso(sec):
    try:
        return dt.datetime.fromtimestamp(float(sec)).astimezone().isoformat(timespec="seconds")
    except (ValueError, TypeError, OSError):
        return None


def window(key, label, utilization, resets_at, window_mins):
    """残量ウィンドウの正規化。utilization は 0-100（使用率）。"""
    try:
        u = max(0.0, min(100.0, float(utilization)))
    except (ValueError, TypeError):
        u = None
    return {"key": key, "label": label, "utilization": u,
            "remaining": (None if u is None else round(100.0 - u, 1)),
            "resets_at": resets_at, "window_mins": window_mins}


# ---------------------------------------------------------------------------
# プロバイダ 1: Claude
# ---------------------------------------------------------------------------
def _win_cred_read(target):
    """Windows 資格情報マネージャーから汎用資格(JSON文字列)を読む。失敗時 None。"""
    if sys.platform != "win32":
        return None
    try:
        import ctypes
        from ctypes import wintypes
        advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)

        class CREDENTIAL(ctypes.Structure):
            _fields_ = [
                ("Flags", wintypes.DWORD), ("Type", wintypes.DWORD),
                ("TargetName", wintypes.LPWSTR), ("Comment", wintypes.LPWSTR),
                ("LastWritten", wintypes.FILETIME),
                ("CredentialBlobSize", wintypes.DWORD),
                ("CredentialBlob", ctypes.POINTER(ctypes.c_char)),
                ("Persist", wintypes.DWORD), ("AttributeCount", wintypes.DWORD),
                ("Attributes", ctypes.c_void_p), ("TargetAlias", wintypes.LPWSTR),
                ("UserName", wintypes.LPWSTR),
            ]
        CredReadW = advapi32.CredReadW
        CredReadW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                              ctypes.POINTER(ctypes.POINTER(CREDENTIAL))]
        CredReadW.restype = wintypes.BOOL
        CredFree = advapi32.CredFree
        CredFree.argtypes = [ctypes.c_void_p]

        ptr = ctypes.POINTER(CREDENTIAL)()
        if not CredReadW(target, 1, 0, ctypes.byref(ptr)):  # 1 = CRED_TYPE_GENERIC
            return None
        try:
            cred = ptr.contents
            size = cred.CredentialBlobSize
            raw = ctypes.string_at(cred.CredentialBlob, size)
        finally:
            CredFree(ptr)
        for enc in ("utf-8", "utf-16-le"):
            try:
                return raw.decode(enc)
            except UnicodeDecodeError:
                continue
        return None
    except Exception:
        return None


def get_claude_token():
    # 1) 環境変数
    tok = os.environ.get("CLAUDE_OAUTH_TOKEN")
    if tok:
        return tok.strip()
    # 2) ~/.claude/.credentials.json
    cred = Path.home() / ".claude" / ".credentials.json"
    if cred.exists():
        try:
            data = json.loads(cred.read_text(encoding="utf-8"))
            tok = (data.get("claudeAiOauth") or {}).get("accessToken")
            if tok:
                return tok
        except (json.JSONDecodeError, OSError):
            pass
    # 3) macOS keychain
    if sys.platform == "darwin" and shutil.which("security"):
        try:
            out = subprocess.run(
                ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
                capture_output=True, text=True, timeout=8).stdout.strip()
            data = json.loads(out)
            tok = (data.get("claudeAiOauth") or {}).get("accessToken")
            if tok:
                return tok
        except (subprocess.SubprocessError, json.JSONDecodeError):
            pass
    # 4) Windows 資格情報マネージャー
    for target in ("Claude Code-credentials", "Claude Code", "claude-code-credentials"):
        blob = _win_cred_read(target)
        if blob:
            try:
                data = json.loads(blob)
                tok = (data.get("claudeAiOauth") or {}).get("accessToken")
                if tok:
                    return tok
            except (json.JSONDecodeError, AttributeError):
                if blob.startswith("ey") or len(blob) > 40:  # 生トークンが直接入っている場合
                    return blob.strip()
    return None


def fetch_claude():
    prov = {"name": "claude", "label": "Claude Code", "ok": False,
            "plan": None, "error": None, "windows": []}
    token = get_claude_token()
    if not token:
        prov["error"] = "Claude Code CLI のログイン情報が見つかりません（この端末では未ログイン）。CLAUDE_OAUTH_TOKEN でも指定可"
        return prov
    req = urllib.request.Request(CLAUDE_USAGE_URL, headers={
        "Authorization": f"Bearer {token}",
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "live-usage-monitor/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        prov["error"] = f"HTTP {e.code}" + (" (レート制限/429・前回値を保持)" if e.code == 429 else "")
        return prov
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        prov["error"] = f"取得失敗: {e}"
        return prov

    fh, sd = data.get("five_hour") or {}, data.get("seven_day") or {}
    if fh:
        prov["windows"].append(window("5h", "5時間", fh.get("utilization"),
                                      fh.get("resets_at"), 300))
    if sd:
        prov["windows"].append(window("7d", "週", sd.get("utilization"),
                                      sd.get("resets_at"), 10080))
    extra = data.get("extra_usage") or {}
    if extra.get("is_enabled"):
        prov["plan"] = "extra_usage"
    prov["ok"] = bool(prov["windows"])
    if not prov["ok"]:
        prov["error"] = "five_hour / seven_day が応答に無し"
    return prov


# ---------------------------------------------------------------------------
# プロバイダ 2: Codex（codex app-server / JSON-RPC）
# ---------------------------------------------------------------------------
def find_codex():
    """codex 実行ファイルを PATH 以外の既定インストール先も含めて探す。"""
    # 環境変数で明示指定
    env = os.environ.get("CODEX_BIN")
    if env and Path(env).exists():
        return env
    # PATH
    for name in ("codex", "codex.exe", "codex.cmd"):
        w = shutil.which(name)
        if w:
            return w
    # Windows 既定インストール先
    cands = []
    local = os.environ.get("LOCALAPPDATA")
    if local:
        cands.append(Path(local) / "OpenAI" / "Codex" / "bin" / "codex.exe")
    home = Path.home()
    cands.append(home / "AppData" / "Local" / "OpenAI" / "Codex" / "bin" / "codex.exe")
    # VSCode 拡張同梱（最新を優先）
    ext = home / ".vscode" / "extensions"
    if ext.exists():
        for d in sorted(ext.glob("openai.chatgpt-*/bin/windows-x86_64/codex.exe"), reverse=True):
            cands.append(d)
    for c in cands:
        try:
            if c.exists():
                return str(c)
        except OSError:
            continue
    return None


def fetch_codex():
    prov = {"name": "codex", "label": "Codex", "ok": False,
            "plan": None, "error": None, "windows": []}
    exe = find_codex()
    if not exe:
        prov["error"] = "codex 実行ファイルが見つからない（CODEX_BIN で指定可）"
        return prov

    init = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                       "params": {"clientInfo": {"name": "usage-monitor", "version": "1.0"}}})
    call = json.dumps({"jsonrpc": "2.0", "id": 2,
                       "method": "account/rateLimits/read", "params": {}})
    try:
        proc = subprocess.Popen([exe, "app-server"], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    except OSError as e:
        prov["error"] = f"起動失敗: {e}"
        return prov

    result = {"rl": None}

    def reader():
        try:
            for line in proc.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if obj.get("id") == 2 and isinstance(obj.get("result"), dict):
                    result["rl"] = obj["result"].get("rateLimits")
                    break
        except (ValueError, OSError):
            pass

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    try:
        proc.stdin.write(init + "\n" + call + "\n")
        proc.stdin.flush()
    except (BrokenPipeError, OSError):
        pass
    t.join(timeout=12)
    try:
        proc.terminate()
    except OSError:
        pass

    rl = result["rl"]
    if not rl:
        prov["error"] = "rateLimits 取得失敗（app-serverの応答なし/タイムアウト）"
        return prov
    prov["plan"] = rl.get("planType")
    prim, sec = rl.get("primary") or {}, rl.get("secondary") or {}
    if prim:
        prov["windows"].append(window("5h", "5時間", prim.get("usedPercent"),
                                      epoch_to_iso(prim.get("resetsAt")),
                                      prim.get("windowDurationMins", 300)))
    if sec:
        prov["windows"].append(window("7d", "週", sec.get("usedPercent"),
                                      epoch_to_iso(sec.get("resetsAt")),
                                      sec.get("windowDurationMins", 10080)))
    prov["ok"] = bool(prov["windows"])
    return prov


# 対象を増やすときはここに関数を追加するだけ
PROVIDERS = [fetch_claude, fetch_codex]


# ---------------------------------------------------------------------------
# 取得 → state.json
# ---------------------------------------------------------------------------
def refresh(force=False):
    with _lock:
        age = time.time() - _cache["last_fetch"]
        if not force and age < MIN_INTERVAL and _cache["claude"]:
            return read_state()  # キャッシュ有効・叩きすぎ防止

        providers = {}
        for fn in PROVIDERS:
            name = fn.__name__.replace("fetch_", "")
            try:
                p = fn()
            except Exception as e:  # noqa
                p = {"name": name, "label": name, "ok": False, "error": f"例外: {e}", "windows": []}
            # 失敗時は前回の良い値を保持（画面のちらつき防止）
            if not p.get("ok") and _cache.get(name) and _cache[name].get("ok"):
                prev = dict(_cache[name])
                prev["stale"] = True
                prev["error"] = p.get("error")
                providers[name] = prev
            else:
                providers[name] = p
                if p.get("ok"):
                    _cache[name] = p
        _cache["last_fetch"] = time.time()

        state = {"updated": now_iso(), "min_interval": MIN_INTERVAL, "providers": providers}
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        return state


def read_state():
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"updated": now_iso(), "providers": {}}


def demo_state():
    n = dt.datetime.now().astimezone()
    iso = lambda m: (n + dt.timedelta(minutes=m)).isoformat(timespec="seconds")
    state = {"updated": now_iso(), "min_interval": MIN_INTERVAL, "providers": {
        "claude": {"name": "claude", "label": "Claude Code", "ok": True, "plan": "Pro", "error": None,
                   "windows": [window("5h", "5時間", 73, iso(63), 300),
                               window("7d", "週", 10, iso(60 * 24 * 6 + 4 * 60), 10080)]},
        "codex": {"name": "codex", "label": "Codex", "ok": True, "plan": "plus", "error": None,
                  "windows": [window("5h", "5時間", 16, iso(259), 300),
                              window("7d", "週", 2, iso(60 * 24 * 6 + 23 * 60), 10080)]},
    }}
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return state


# ---------------------------------------------------------------------------
# 配信
# ---------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(HERE), **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


def serve(port, interval, demo):
    def loop():
        while True:
            try:
                demo_state() if demo else refresh()
            except Exception as e:  # noqa
                print(f"  ! 取得エラー: {e}")
            time.sleep(interval)

    threading.Thread(target=loop, daemon=True).start()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://localhost:{port}/live_dashboard.html"
    print(f"ライブ残量モニタを起動: {url}")
    print(f"  取得間隔: {interval}s / 最短: {MIN_INTERVAL}s / state: {STATE_PATH.name}")
    print("  停止: Ctrl+C")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました。")
        httpd.shutdown()


def main():
    ap = argparse.ArgumentParser(description="Claude / Codex ライブ残量モニタ")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--interval", type=int, default=60, help="取得間隔(秒)")
    ap.add_argument("--once", action="store_true", help="1回取得して終了")
    ap.add_argument("--demo", action="store_true", help="サンプルデータで配信")
    args = ap.parse_args()

    if args.once:
        st = demo_state() if args.demo else refresh(force=True)
        for name, p in st["providers"].items():
            tag = "OK" if p.get("ok") else f"NG({p.get('error')})"
            wins = " ".join(f"{w['label']}={w['remaining']}%残" for w in p.get("windows", []))
            print(f"  {p.get('label', name)}: {tag}  {wins}")
        print(f"  ✓ {STATE_PATH}")
        return

    interval = max(MIN_INTERVAL, args.interval)
    serve(args.port, interval, args.demo)


if __name__ == "__main__":
    main()
