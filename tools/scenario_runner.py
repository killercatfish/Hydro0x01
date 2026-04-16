#!/usr/bin/env python3
"""
HydroOne Scenario Runner
tools/scenario_runner.py

Loads a YAML scenario file and drives the simulator in sequence — injecting
faults, toggling actuators, and asserting expected backend responses at defined
timestamps.  Use this for automated testing without physical hardware.

Usage:
    python tools/scenario_runner.py scenarios/ph_crash_recovery.yaml
    python tools/scenario_runner.py scenarios/ec_depletion.yaml --broker localhost:1883
    python tools/scenario_runner.py scenarios/low_water_alert.yaml --no-mqtt
    python tools/scenario_runner.py --list    # show all available scenarios

Requires:
    pip install paho-mqtt rich pyyaml
"""

import argparse
import json
import math
import os
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml not installed. Run: pip install pyyaml")
    sys.exit(1)

try:
    import paho.mqtt.client as mqtt
    MQTT_AVAILABLE = True
except ImportError:
    MQTT_AVAILABLE = False

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.live import Live
from rich.layout import Layout
from rich import box

# ── Reuse physics from simulator ──────────────────────────────────────────────

# Add tools/ to path so we can import simulator
sys.path.insert(0, str(Path(__file__).parent))
try:
    from simulator import SystemState, full_topic, noise, INTERVAL
except ImportError:
    print("ERROR: simulator.py not found. Run from repo root:")
    print("  python tools/scenario_runner.py <scenario>")
    sys.exit(1)

console = Console()

# ── Scenario schema ───────────────────────────────────────────────────────────

VALID_ACTIONS = {
    "inject_fault", "clear_fault", "clear_all_faults",
    "set_pump", "set_light", "set_fan", "set_mode",
    "assert_sensor", "assert_cmd", "assert_status",
    "wait", "log",
}

FAULT_KEYS = {"ph", "ec", "temp", "level", "humidity"}

SENSOR_MAP = {
    "ph":           lambda s: s.ph(),
    "ec":           lambda s: s.ec(),
    "water_temp":   lambda s: s.water_temp(),
    "air_temp":     lambda s: s.air_temp(),
    "humidity":     lambda s: s.air_humidity(),
    "level_pct":    lambda s: s.level_percent(),
    "level_litres": lambda s: s.level_litres(),
    "distance":     lambda s: s.reservoir_distance(),
}


# ── Result tracking ───────────────────────────────────────────────────────────

class AssertionResult:
    def __init__(self, at, kind, detail, passed, actual=None):
        self.at      = at
        self.kind    = kind
        self.detail  = detail
        self.passed  = passed
        self.actual  = actual
        self.ts      = datetime.now()


class ScenarioResult:
    def __init__(self, name):
        self.name       = name
        self.assertions = []
        self.events     = []
        self.started    = datetime.now()
        self.finished   = None

    def add_assertion(self, r: AssertionResult):
        self.assertions.append(r)

    def add_event(self, at, msg):
        self.events.append((at, msg, datetime.now()))

    def finish(self):
        self.finished = datetime.now()

    @property
    def passed(self):
        return all(a.passed for a in self.assertions)

    @property
    def duration(self):
        if self.finished:
            return (self.finished - self.started).total_seconds()
        return 0


# ── MQTT command listener ─────────────────────────────────────────────────────

class CmdListener:
    """Tracks cmd/ messages received from the backend."""
    def __init__(self):
        self.received = []   # list of (topic_suffix, payload, received_at)
        self._lock    = __import__("threading").Lock()

    def record(self, suffix, payload):
        with self._lock:
            self.received.append((suffix, payload, time.time()))

    def has_received(self, suffix, since=0.0):
        with self._lock:
            return any(
                s == suffix and t >= since
                for s, _, t in self.received
            )

    def clear(self):
        with self._lock:
            self.received.clear()


# ── Scenario loader ───────────────────────────────────────────────────────────

def load_scenario(path: str) -> dict:
    with open(path) as f:
        data = yaml.safe_load(f)

    required = {"name", "description", "duration", "steps"}
    missing  = required - set(data.keys())
    if missing:
        raise ValueError(f"Scenario missing required keys: {missing}")

    for i, step in enumerate(data.get("steps", [])):
        if "at" not in step:
            raise ValueError(f"Step {i} missing 'at' field")
        if "action" not in step:
            raise ValueError(f"Step {i} missing 'action' field")
        if step["action"] not in VALID_ACTIONS:
            raise ValueError(
                f"Step {i} unknown action '{step['action']}'. "
                f"Valid: {sorted(VALID_ACTIONS)}"
            )

    return data


# ── Step executor ─────────────────────────────────────────────────────────────

def execute_step(step, state, result, listener, sim_t, client, connected):
    action  = step["action"]
    at_str  = f"t+{step['at']}s"

    if action == "inject_fault":
        key = step.get("sensor")
        mag = float(step.get("magnitude", -1.0))
        if key not in FAULT_KEYS:
            result.add_event(at_str, f"[red]unknown fault key: {key}[/red]")
            return
        state.inject(key, mag)
        result.add_event(at_str, f"[yellow]FAULT injected: {key} mag={mag:+.2f}[/yellow]")

    elif action == "clear_fault":
        key = step.get("sensor")
        state.faults.pop(key, None)
        result.add_event(at_str, f"[dim]fault cleared: {key}[/dim]")

    elif action == "clear_all_faults":
        state.reset()
        result.add_event(at_str, "[dim]all faults cleared[/dim]")

    elif action == "set_pump":
        state.pump_on = step.get("value", False)
        result.add_event(at_str, f"pump → {'ON' if state.pump_on else 'OFF'}")

    elif action == "set_light":
        state.light_on = step.get("value", True)
        result.add_event(at_str, f"light → {'ON' if state.light_on else 'OFF'}")

    elif action == "set_fan":
        state.fan_on = step.get("value", False)
        result.add_event(at_str, f"fan → {'ON' if state.fan_on else 'OFF'}")

    elif action == "set_mode":
        state.mode = step.get("value", "active")
        result.add_event(at_str, f"mode → {state.mode}")

    elif action == "assert_sensor":
        sensor  = step.get("sensor")
        op      = step.get("op", "in_range")
        fn      = SENSOR_MAP.get(sensor)
        if fn is None:
            result.add_assertion(AssertionResult(
                at_str, f"assert_sensor:{sensor}", "unknown sensor", False
            ))
            return
        actual = fn(state)

        if op == "in_range":
            lo, hi = float(step["min"]), float(step["max"])
            passed = lo <= actual <= hi
            detail = f"{sensor} in [{lo}, {hi}]"
        elif op == "lt":
            threshold = float(step["value"])
            passed    = actual < threshold
            detail    = f"{sensor} < {threshold}"
        elif op == "gt":
            threshold = float(step["value"])
            passed    = actual > threshold
            detail    = f"{sensor} > {threshold}"
        else:
            passed = False
            detail = f"unknown op: {op}"

        result.add_assertion(AssertionResult(
            at_str, f"assert_sensor:{sensor}", detail, passed, actual
        ))

    elif action == "assert_cmd":
        # Check if backend published a cmd/ response since scenario start
        cmd_suffix = step.get("cmd")
        since      = step.get("since", 0.0)
        # If no commands have ever been received, backend is not running — skip
        if not listener.received:
            result.add_event(
                at_str,
                f"[dim]assert_cmd:{cmd_suffix} skipped (no backend connected)[/dim]"
            )
            return
        passed = listener.has_received(cmd_suffix, since=since)
        result.add_assertion(AssertionResult(
            at_str, f"assert_cmd:{cmd_suffix}",
            f"cmd/{cmd_suffix} received from backend",
            passed
        ))

    elif action == "assert_status":
        key    = step.get("key")
        expect = step.get("value")
        st     = state.status_payload()
        actual = st.get(key)
        passed = actual == expect
        result.add_assertion(AssertionResult(
            at_str, f"assert_status:{key}",
            f"status.{key} == {expect}",
            passed, actual
        ))

    elif action == "log":
        result.add_event(at_str, f"[dim]{step.get('message', '')}[/dim]")

    elif action == "wait":
        pass   # handled by timing loop


# ── TUI rendering ─────────────────────────────────────────────────────────────

def render_scenario(scenario, state, result, sim_t, total_dur, connected, broker):
    layout = Layout()
    layout.split_column(
        Layout(name="header",  size=3),
        Layout(name="main",    ratio=1),
        Layout(name="footer",  size=4),
    )
    layout["main"].split_row(
        Layout(name="left",  ratio=2),
        Layout(name="right", ratio=3),
    )

    # Header
    pct     = min(100, int(sim_t / total_dur * 100))
    bar_w   = 30
    filled  = int(bar_w * pct / 100)
    bar     = "█" * filled + "░" * (bar_w - filled)
    conn    = f"[green]● {broker}[/]" if connected else "[yellow]● offline[/]"
    layout["header"].update(Panel(
        f"  [bold]{scenario['name']}[/]   [{bar}] {pct}%   "
        f"t+{int(sim_t)}s / {total_dur}s   {conn}",
        box=box.HORIZONTALS
    ))

    # Sensor table
    sensors = state.all_sensors()
    st = Table(box=box.SIMPLE_HEAD, show_header=True,
               header_style="bold dim", expand=True)
    st.add_column("Sensor",  style="dim", width=16)
    st.add_column("Value",   justify="right", width=9)
    st.add_column("Unit",    width=7)

    rows = [
        ("Water pH",    sensors["ph"],           ""),
        ("Water EC",    sensors["ec"],            "mS/cm"),
        ("Water Temp",  sensors["water_temp"],    "°C"),
        ("Air Temp",    sensors["air_temp"],      "°C"),
        ("Humidity",    sensors["humidity"],      "%"),
        ("Tank Level",  sensors["level_pct"],     "%"),
    ]
    for label, val, unit in rows:
        st.add_row(label, f"[bold]{val}[/]", f"[dim]{unit}[/]")

    layout["left"].update(Panel(st, title="[bold]sensors[/]",
                                border_style="dim", box=box.ROUNDED))

    # Event + assertion log
    lines = []
    for at, msg, _ in result.events[-12:]:
        lines.append(f"[dim]{at:>8}[/]  {msg}")
    for a in result.assertions[-6:]:
        icon  = "[green]✓[/]" if a.passed else "[red]✗[/]"
        color = "green" if a.passed else "red"
        actual_str = f" → {a.actual}" if a.actual is not None else ""
        lines.append(
            f"[dim]{a.at:>8}[/]  {icon} [{color}]{a.detail}{actual_str}[/{color}]"
        )

    layout["right"].update(Panel(
        "\n".join(lines) if lines else "[dim]waiting...[/dim]",
        title="[bold]event log[/]", border_style="dim", box=box.ROUNDED
    ))

    # Footer — upcoming steps
    upcoming = [
        s for s in scenario["steps"]
        if s["at"] > sim_t
    ][:4]
    upcoming_str = "  ".join(
        f"[dim]t+{s['at']}s[/] {s['action']}" for s in upcoming
    ) or "[dim]scenario complete[/dim]"
    layout["footer"].update(Panel(
        f"  next: {upcoming_str}",
        title="[bold]upcoming[/]", border_style="dim", box=box.HORIZONTALS
    ))

    return layout


def render_report(scenario, result):
    console.rule(f"[bold]{scenario['name']} — scenario complete[/bold]")
    console.print()

    t = Table(box=box.SIMPLE_HEAD, show_header=True,
              header_style="bold dim", expand=False)
    t.add_column("Time",      style="dim",  width=10)
    t.add_column("Assertion", width=38)
    t.add_column("Result",    width=8)
    t.add_column("Actual",    width=12)

    for a in result.assertions:
        icon  = "✓ PASS" if a.passed else "✗ FAIL"
        color = "green"  if a.passed else "red"
        t.add_row(
            a.at,
            a.detail,
            f"[{color}]{icon}[/]",
            str(a.actual) if a.actual is not None else "—"
        )

    console.print(t)
    console.print()

    passed = sum(1 for a in result.assertions if a.passed)
    total  = len(result.assertions)
    color  = "green" if result.passed else "red"
    console.print(
        f"  [{color}]{'PASSED' if result.passed else 'FAILED'}[/]  "
        f"{passed}/{total} assertions  "
        f"duration {result.duration:.1f}s"
    )
    console.print()

    if result.events:
        console.print("[dim]Events:[/dim]")
        for at, msg, _ in result.events:
            console.print(f"  [dim]{at:>8}[/]  {msg}")

    console.print()
    return 0 if result.passed else 1


# ── MQTT setup ────────────────────────────────────────────────────────────────

def make_runner_client(state, listener):
    if not MQTT_AVAILABLE:
        return None
    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"HydroOne-ScenarioRunner-{__import__('random').randint(1000,9999)}"
    )

    def on_connect(c, userdata, flags, rc, props=None):
        if rc == 0:
            c.subscribe(full_topic("cmd/#"))

    def on_message(c, userdata, msg):
        suffix = msg.topic.split("/cmd/", 1)[-1] if "/cmd/" in msg.topic else msg.topic.split("/")[-1]
        try:
            payload = json.loads(msg.payload)
        except Exception:
            payload = msg.payload.decode()
        listener.record(suffix, payload)
        state.log.append((f"[cyan]← CMD {suffix}[/cyan]", datetime.now()))

    client.on_connect = on_connect
    client.on_message = on_message
    return client


# ── Main ──────────────────────────────────────────────────────────────────────

def list_scenarios():
    folder = Path(__file__).parent.parent / "scenarios"
    if not folder.exists():
        console.print("[red]No scenarios/ folder found.[/red]")
        return
    files = sorted(folder.glob("*.yaml"))
    if not files:
        console.print("[dim]No .yaml scenario files found in scenarios/[/dim]")
        return
    console.print()
    for f in files:
        try:
            data = yaml.safe_load(f.read_text())
            console.print(
                f"  [bold]{f.name}[/bold]  "
                f"[dim]{data.get('description', '')}[/dim]  "
                f"[dim]duration={data.get('duration')}s[/dim]"
            )
        except Exception:
            console.print(f"  [red]{f.name}[/red] (parse error)")
    console.print()


def run(args):
    scenario = load_scenario(args.scenario)
    state    = SystemState()
    listener = CmdListener()
    result   = ScenarioResult(scenario["name"])
    total    = int(scenario["duration"])
    broker   = args.broker

    # Sort steps by time
    steps = sorted(scenario["steps"], key=lambda s: s["at"])
    step_idx = 0

    # MQTT
    client    = None
    connected = False
    if not args.no_mqtt and MQTT_AVAILABLE:
        client = make_runner_client(state, listener)
        try:
            host, port = broker.split(":") if ":" in broker else (broker, "1883")
            client.connect(host, int(port), keepalive=60)
            client.loop_start()
            connected = True
        except Exception as e:
            console.print(f"[yellow]Broker unreachable ({e}), running offline.[/yellow]")

    next_publish = time.time()
    start_real   = time.time()

    with Live(
        render_scenario(scenario, state, result, 0, total, connected, broker),
        console=console, refresh_per_second=4, screen=True
    ) as live:
        while True:
            now    = time.time()
            sim_t  = (now - start_real) * args.speed

            # Advance internal sim clock
            state.t = sim_t

            # Execute due steps
            while step_idx < len(steps) and steps[step_idx]["at"] <= sim_t:
                execute_step(
                    steps[step_idx], state, result,
                    listener, sim_t, client, connected
                )
                step_idx += 1

            # Publish telemetry
            if now >= next_publish:
                next_publish = now + INTERVAL
                sensors  = state.all_sensors()
                ts_iso   = datetime.utcnow().isoformat() + "Z"
                publishes = [
                    ("sensors/water/temperature",  sensors["water_temp"]),
                    ("sensors/air/temperature",    sensors["air_temp"]),
                    ("sensors/air/humidity",       sensors["humidity"]),
                    ("sensors/air/pressure",       sensors["pressure"]),
                    ("sensors/water/ph",           sensors["ph"]),
                    ("sensors/water/ec",           sensors["ec"]),
                    ("sensors/reservoir/distance", sensors["distance"]),
                    ("sensors/water/level_percent",sensors["level_pct"]),
                    ("sensors/water/level_litres", sensors["level_litres"]),
                    ("status",                     json.dumps(state.status_payload())),
                    ("heartbeat",                  ts_iso),
                ]
                for suffix, payload in publishes:
                    msg = str(payload) if not isinstance(payload, str) else payload
                    if client and connected:
                        client.publish(full_topic(suffix), msg, qos=1)
                    state.mqtt_out.append((full_topic(suffix), msg))
                if len(state.mqtt_out) > 60:
                    state.mqtt_out = state.mqtt_out[-60:]

            live.update(
                render_scenario(scenario, state, result, sim_t, total, connected, broker)
            )

            if sim_t >= total:
                break

            time.sleep(0.1)

    if client:
        client.loop_stop()
        client.disconnect()

    result.finish()
    return render_report(scenario, result)


def main():
    parser = argparse.ArgumentParser(
        description="HydroOne scenario runner — automated simulator testing"
    )
    parser.add_argument("scenario",         nargs="?",              help="path to .yaml scenario file")
    parser.add_argument("--broker",         default="localhost:1883",help="MQTT broker host[:port]")
    parser.add_argument("--no-mqtt",        action="store_true",    help="offline mode")
    parser.add_argument("--speed",          type=float, default=1.0,help="sim speed multiplier (e.g. 2.0 = 2x)")
    parser.add_argument("--list",           action="store_true",    help="list available scenarios")
    args = parser.parse_args()

    if args.list:
        list_scenarios()
        return 0

    if not args.scenario:
        parser.print_help()
        return 1

    if not os.path.exists(args.scenario):
        console.print(f"[red]Scenario not found: {args.scenario}[/red]")
        return 1

    try:
        return run(args)
    except (yaml.YAMLError, ValueError) as e:
        console.print(f"[red]Scenario error: {e}[/red]")
        return 1
    except KeyboardInterrupt:
        console.print("\n[dim]Aborted.[/dim]")
        return 1


if __name__ == "__main__":
    sys.exit(main())
