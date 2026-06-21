#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
collect.py — Claude Code / Codex 使用量コレクタ
================================================

~/.claude (Claude Code) と ~/.codex (Codex CLI) のローカルログを解析し、
トークン使用量・セッション・モデル別集計・ツール使用回数を usage_data.json に出力する。
psutil があればメモリ/システム情報も取得する。

使い方:
    python collect.py                 # 自動検出して usage_data.json を出力
    python collect.py --build-html    # dashboard.html にデータを埋め込んだ自己完結HTMLも生成
    python collect.py --claude PATH --codex PATH   # パスを明示指定

拡張方法:
    COLLECTORS リストに「dict を返す関数」を追加するだけで新しいデータ源を足せる。
    出力された JSON のキーを dashboard.html 側のパネルが読む。
"""

import argparse
import datetime as dt
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# 料金表（1Mトークンあたり USD・概算）。最新の単価に書き換え可能。
# キーはモデル名の部分一致で判定する。
# ---------------------------------------------------------------------------
PRICING = {
    # Anthropic Claude
    "claude-opus-4":      {"input": 15.00, "output": 75.00, "cache_read": 1.50,  "cache_write": 18.75},
    "claude-sonnet-4":    {"input": 3.00,  "output": 15.00, "cache_read": 0.30,  "cache_write": 3.75},
    "claude-haiku-4":     {"input": 1.00,  "output": 5.00,  "cache_read": 0.10,  "cache_write": 1.25},
    "claude-3-5-sonnet":  {"input": 3.00,  "output": 15.00, "cache_read": 0.30,  "cache_write": 3.75},
    "claude-3-5-haiku":   {"input": 0.80,  "output": 4.00,  "cache_read": 0.08,  "cache_write": 1.00},
    # OpenAI Codex (gpt-5 系・概算)
    "gpt-5-codex":        {"input": 1.25,  "output": 10.00, "cache_read": 0.125, "cache_write": 1.25},
    "gpt-5":              {"input": 1.25,  "output": 10.00, "cache_read": 0.125, "cache_write": 1.25},
    "o4":                 {"input": 1.10,  "output": 4.40,  "cache_read": 0.275, "cache_write": 1.10},
    "_default":           {"input": 3.00,  "output": 15.00, "cache_read": 0.30,  "cache_write": 3.75},
}


def price_for(model: str):
    if not model:
        return PRICING["_default"]
    m = model.lower()
    for key, val in PRICING.items():
        if key != "_default" and key in m:
            return val
    return PRICING["_default"]


def cost_of(model, input_t=0, output_t=0, cache_read=0, cache_write=0):
    p = price_for(model)
    return (
        input_t / 1e6 * p["input"]
        + output_t / 1e6 * p["output"]
        + cache_read / 1e6 * p["cache_read"]
        + cache_write / 1e6 * p["cache_write"]
    )


# ---------------------------------------------------------------------------
# パス検出
# ---------------------------------------------------------------------------
def candidate_dirs(name):
    home = Path.home()
    cands = [home / name]
    # Windows の代替
    if os.name == "nt":
        for env in ("USERPROFILE", "APPDATA", "LOCALAPPDATA"):
            v = os.environ.get(env)
            if v:
                cands.append(Path(v) / name)
    # XDG
    xdg = os.environ.get("XDG_CONFIG_HOME")
    if xdg:
        cands.append(Path(xdg) / name)
    seen, out = set(), []
    for c in cands:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


def find_dir(name, override=None):
    if override:
        p = Path(override).expanduser()
        return p if p.exists() else None
    for c in candidate_dirs(name):
        if c.exists():
            return c
    return None


def iter_jsonl(path):
    """jsonl の各行を dict で yield（壊れた行はスキップ）。"""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except (json.JSONDecodeError, ValueError):
                    continue
    except OSError:
        return


def to_date(ts):
    """ISO文字列 / epoch を YYYY-MM-DD に。失敗時 None。"""
    if ts is None:
        return None
    try:
        if isinstance(ts, (int, float)):
            return dt.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
        s = str(ts).replace("Z", "+00:00")
        return dt.datetime.fromisoformat(s).strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        # 末尾を切ってもう一度
        try:
            return str(ts)[:10]
        except Exception:
            return None


# ---------------------------------------------------------------------------
# コレクタ 1: Claude Code
# ---------------------------------------------------------------------------
def collect_claude_code(args, agg):
    root = find_dir(".claude", args.claude)
    info = {"found": False, "path": None, "files": 0, "sessions": 0}
    if not root:
        agg["sources"]["claude_code"] = info
        return
    proj = root / "projects"
    if not proj.exists():
        proj = root
    info["found"] = True
    info["path"] = str(root)

    sessions = set()
    files = 0
    for jf in proj.rglob("*.jsonl"):
        files += 1
        for obj in iter_jsonl(jf):
            if obj.get("type") != "assistant":
                continue
            msg = obj.get("message") or {}
            usage = msg.get("usage") or {}
            if not usage:
                continue
            model = msg.get("model") or "unknown"
            date = to_date(obj.get("timestamp")) or "unknown"
            sid = obj.get("sessionId") or jf.stem
            sessions.add(sid)

            it = usage.get("input_tokens", 0) or 0
            ot = usage.get("output_tokens", 0) or 0
            cc = usage.get("cache_creation_input_tokens", 0) or 0
            cr = usage.get("cache_read_input_tokens", 0) or 0
            cost = cost_of(model, it, ot, cr, cc)

            _add(agg, tool="claude_code", date=date, model=model, sid=sid,
                 cwd=obj.get("cwd"), input_t=it, output_t=ot, cache_read=cr,
                 cache_write=cc, reasoning=0, cost=cost)

            # ツール使用回数
            for part in (msg.get("content") or []):
                if isinstance(part, dict) and part.get("type") == "tool_use":
                    agg["tools_used"][part.get("name", "unknown")] += 1
    info["files"] = files
    info["sessions"] = len(sessions)
    agg["sources"]["claude_code"] = info


# ---------------------------------------------------------------------------
# コレクタ 2: Codex CLI
# ---------------------------------------------------------------------------
def _extract_codex_usage(payload):
    """codex のバージョン差を吸収してトークン辞書を取り出す。"""
    if not isinstance(payload, dict):
        return None
    src = payload
    for key in ("info", "total_token_usage", "last_token_usage", "usage"):
        if isinstance(payload.get(key), dict):
            inner = payload[key]
            if isinstance(inner.get("total_token_usage"), dict):
                src = inner["total_token_usage"]
            else:
                src = inner
            break
    keys = ("input_tokens", "output_tokens", "cached_input_tokens",
            "reasoning_output_tokens", "total_tokens", "cache_read_input_tokens")
    if not any(k in src for k in keys):
        return None
    return {
        "input": src.get("input_tokens", 0) or 0,
        "output": src.get("output_tokens", 0) or 0,
        "cache_read": src.get("cached_input_tokens", src.get("cache_read_input_tokens", 0)) or 0,
        "reasoning": src.get("reasoning_output_tokens", 0) or 0,
        "total": src.get("total_tokens", 0) or 0,
    }


def collect_codex(args, agg):
    root = find_dir(".codex", args.codex)
    info = {"found": False, "path": None, "files": 0, "sessions": 0}
    if not root:
        agg["sources"]["codex"] = info
        return
    sess_dir = root / "sessions"
    if not sess_dir.exists():
        sess_dir = root
    info["found"] = True
    info["path"] = str(root)

    files = 0
    sessions = 0
    for jf in sess_dir.rglob("*.jsonl"):
        files += 1
        sessions += 1
        sid = jf.stem
        # ファイルパス YYYY/MM/DD からの日付推定
        date_from_path = None
        parts = jf.parts
        for i in range(len(parts) - 3):
            a, b, c = parts[i], parts[i + 1], parts[i + 2]
            if a.isdigit() and len(a) == 4 and b.isdigit() and c.isdigit():
                date_from_path = f"{a}-{b.zfill(2)}-{c.zfill(2)}"
                break

        last_cumulative = None
        model = "gpt-5-codex"
        date = date_from_path
        for obj in iter_jsonl(jf):
            ts = obj.get("timestamp") or obj.get("ts")
            if ts and not date:
                date = to_date(ts)
            payload = obj.get("payload") if isinstance(obj.get("payload"), dict) else obj
            ptype = payload.get("type") if isinstance(payload, dict) else None
            # モデル名の検出
            for mk in ("model", "model_slug"):
                if isinstance(payload, dict) and payload.get(mk):
                    model = payload[mk]
            if ptype == "token_count" or "token" in str(ptype):
                u = _extract_codex_usage(payload)
                if u:
                    last_cumulative = u  # 累積。最後の値をセッション合計とみなす
        if last_cumulative:
            d = date or "unknown"
            _add(agg, tool="codex", date=d, model=model, sid=sid, cwd=None,
                 input_t=last_cumulative["input"], output_t=last_cumulative["output"],
                 cache_read=last_cumulative["cache_read"], cache_write=0,
                 reasoning=last_cumulative["reasoning"],
                 cost=cost_of(model, last_cumulative["input"], last_cumulative["output"],
                              last_cumulative["cache_read"], 0))
    info["files"] = files
    info["sessions"] = sessions
    agg["sources"]["codex"] = info


# ---------------------------------------------------------------------------
# コレクタ 3: メモリ / システム
# ---------------------------------------------------------------------------
def collect_system(args, agg):
    sysinfo = {"found": False, "note": "", "timestamp": dt.datetime.now().isoformat()}
    try:
        import psutil  # type: ignore
    except ImportError:
        sysinfo["note"] = "psutil 未インストール。`pip install psutil` でメモリ/プロセス情報を取得できます。"
        agg["system"] = sysinfo
        return
    try:
        vm = psutil.virtual_memory()
        sysinfo.update({
            "found": True,
            "cpu_percent": psutil.cpu_percent(interval=0.3),
            "cpu_count": psutil.cpu_count(),
            "memory": {
                "total": vm.total, "available": vm.available,
                "used": vm.used, "percent": vm.percent,
            },
        })
        procs = []
        self_pid = os.getpid()
        self_file = os.path.basename(__file__).lower()  # collect.py 自身は除外
        for p in psutil.process_iter(["name", "pid", "memory_info", "cmdline"]):
            try:
                if p.info.get("pid") == self_pid:
                    continue
                nm = (p.info.get("name") or "").lower()
                cmdlist = [str(c).lower() for c in (p.info.get("cmdline") or [])]
                cmd = " ".join(cmdlist)
                if self_file and self_file in cmd:   # 自分自身の呼び出しを除外
                    continue
                # cmdline はパス全体ではなく実行ファイル名トークンで判定（誤検出防止）
                tokens = [os.path.basename(c.rstrip("/\\")) for c in cmdlist]
                is_claude = ("claude" in nm) or any(
                    t == "claude" or "claude-code" in t or "@anthropic" in t for t in tokens)
                is_codex = ("codex" in nm) or any(
                    t == "codex" or t.startswith("codex") or "@openai/codex" in t for t in tokens)
                if not (is_claude or is_codex):
                    continue
                mi = p.info.get("memory_info")
                rss = getattr(mi, "rss", 0) if mi else 0
                procs.append({"name": p.info.get("name"),
                              "label": "claude" if is_claude else "codex",
                              "pid": p.info.get("pid"), "rss": rss})
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        procs.sort(key=lambda x: x["rss"], reverse=True)
        sysinfo["processes"] = procs[:30]
    except Exception as e:  # noqa
        sysinfo["note"] = f"システム情報取得中にエラー: {e}"
    agg["system"] = sysinfo


# 新しいデータ源を足すときはここに関数を追加するだけ
COLLECTORS = [collect_claude_code, collect_codex, collect_system]


# ---------------------------------------------------------------------------
# 集計ヘルパ
# ---------------------------------------------------------------------------
def _add(agg, tool, date, model, sid, cwd, input_t, output_t,
         cache_read, cache_write, reasoning, cost):
    total = input_t + output_t + cache_read + cache_write + reasoning
    d = agg["_daily"][(date, tool)]
    d["input"] += input_t; d["output"] += output_t
    d["cache_read"] += cache_read; d["cache_write"] += cache_write
    d["reasoning"] += reasoning; d["total"] += total
    d["cost"] += cost; d["messages"] += 1; d["_sessions"].add(sid)

    m = agg["_models"][(model, tool)]
    m["input"] += input_t; m["output"] += output_t
    m["cache_read"] += cache_read; m["cache_write"] += cache_write
    m["reasoning"] += reasoning; m["total"] += total
    m["cost"] += cost; m["messages"] += 1

    s = agg["_sessions"][sid]
    s["tool"] = tool; s["date"] = date; s["model"] = model
    if cwd:
        s["cwd"] = cwd
    s["total"] += total; s["cost"] += cost; s["messages"] += 1


def new_agg():
    return {
        "sources": {},
        "tools_used": defaultdict(int),
        "_daily": defaultdict(lambda: {"input": 0, "output": 0, "cache_read": 0,
                                       "cache_write": 0, "reasoning": 0, "total": 0,
                                       "cost": 0.0, "messages": 0, "_sessions": set()}),
        "_models": defaultdict(lambda: {"input": 0, "output": 0, "cache_read": 0,
                                        "cache_write": 0, "reasoning": 0, "total": 0,
                                        "cost": 0.0, "messages": 0}),
        "_sessions": defaultdict(lambda: {"total": 0, "cost": 0.0, "messages": 0,
                                          "tool": None, "date": None, "model": None,
                                          "cwd": None}),
        "system": {},
    }


def finalize(agg):
    daily = []
    for (date, tool), v in sorted(agg["_daily"].items(), key=lambda kv: (kv[0][0] or "")):
        row = {k: val for k, val in v.items() if k != "_sessions"}
        row.update({"date": date, "tool": tool, "sessions": len(v["_sessions"])})
        row["cost"] = round(row["cost"], 4)
        daily.append(row)

    models = []
    for (model, tool), v in sorted(agg["_models"].items(), key=lambda kv: -kv[1]["total"]):
        row = dict(v); row.update({"model": model, "tool": tool})
        row["cost"] = round(row["cost"], 4)
        models.append(row)

    sessions = []
    for sid, v in agg["_sessions"].items():
        row = dict(v); row["id"] = sid
        row["cost"] = round(row["cost"], 4)
        sessions.append(row)
    sessions.sort(key=lambda r: r["total"], reverse=True)

    totals = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0,
              "reasoning": 0, "total": 0, "cost": 0.0,
              "sessions": len(agg["_sessions"]), "messages": 0,
              "by_tool": defaultdict(lambda: {"total": 0, "cost": 0.0, "sessions": 0})}
    for r in daily:
        for k in ("input", "output", "cache_read", "cache_write", "reasoning", "total", "messages"):
            totals[k] += r[k]
        totals["cost"] += r["cost"]
        bt = totals["by_tool"][r["tool"]]
        bt["total"] += r["total"]; bt["cost"] += r["cost"]; bt["sessions"] += r["sessions"]
    totals["cost"] = round(totals["cost"], 4)
    totals["by_tool"] = {k: {"total": v["total"], "cost": round(v["cost"], 4),
                             "sessions": v["sessions"]} for k, v in totals["by_tool"].items()}

    tools_used = sorted([{"name": k, "count": v} for k, v in agg["tools_used"].items()],
                        key=lambda x: -x["count"])

    return {
        "generatedAt": dt.datetime.now().isoformat(timespec="seconds"),
        "tool_version": "1.0",
        "pricing_note": "コストは PRICING テーブルに基づく概算です。最新単価に書き換えてください。",
        "sources": agg["sources"],
        "totals": totals,
        "daily": daily,
        "models": models,
        "sessions": sessions[:200],
        "tools_used": tools_used,
        "system": agg["system"],
    }


# ---------------------------------------------------------------------------
def build_html(data, template_path, out_path):
    if not template_path.exists():
        print(f"  ! テンプレートが見つかりません: {template_path}")
        return
    html = template_path.read_text(encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=False)
    inject = f'<script id="embedded-data" type="application/json">{payload}</script>'
    marker = "<!--EMBED_DATA-->"
    if marker in html:
        html = html.replace(marker, inject)
    else:
        html = html.replace("</body>", inject + "\n</body>")
    out_path.write_text(html, encoding="utf-8")
    print(f"  ✓ 自己完結HTMLを出力: {out_path}")


def main():
    ap = argparse.ArgumentParser(description="Claude Code / Codex 使用量コレクタ")
    ap.add_argument("--claude", help="~/.claude のパスを明示指定")
    ap.add_argument("--codex", help="~/.codex のパスを明示指定")
    ap.add_argument("--out", default="usage_data.json", help="出力JSONパス")
    ap.add_argument("--build-html", action="store_true",
                    help="dashboard.html にデータを埋め込んだ自己完結HTMLも生成")
    args = ap.parse_args()

    here = Path(__file__).resolve().parent
    agg = new_agg()
    print("収集を開始します...")
    for fn in COLLECTORS:
        try:
            fn(args, agg)
        except Exception as e:  # noqa
            print(f"  ! {fn.__name__} で例外: {e}")
    data = finalize(agg)

    out = (here / args.out) if not os.path.isabs(args.out) else Path(args.out)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    cc = data["sources"].get("claude_code", {})
    cx = data["sources"].get("codex", {})
    print(f"  Claude Code: {'検出' if cc.get('found') else '未検出'} "
          f"(files={cc.get('files',0)}, sessions={cc.get('sessions',0)})")
    print(f"  Codex:       {'検出' if cx.get('found') else '未検出'} "
          f"(files={cx.get('files',0)}, sessions={cx.get('sessions',0)})")
    print(f"  合計トークン: {data['totals']['total']:,}  概算コスト: ${data['totals']['cost']:.2f}")
    print(f"  ✓ JSON出力: {out}")

    if args.build_html:
        build_html(data, here / "dashboard.html", here / "usage_dashboard_filled.html")

    print("完了。dashboard.html を開いて usage_data.json をドラッグ&ドロップしてください。")


if __name__ == "__main__":
    main()
