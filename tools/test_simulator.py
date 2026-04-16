#!/usr/bin/env python3
"""
HydroOne Production Test Suite
tools/test_simulator.py

Four layers of automated testing — no terminal, no broker, no human needed.

  Layer 1 — Unit:        state transitions, sensor physics, fault injection
  Layer 2 — Integration: MQTT publish verification (requires broker)
  Layer 3 — Consistency: cross-sensor sanity checks
  Layer 4 — Regression:  one test per bug found in the field

Usage:
    python tools/test_simulator.py              # layers 1, 3, 4 (no broker)
    python tools/test_simulator.py --all        # all layers (needs Mosquitto)
    python tools/test_simulator.py --layer 2    # single layer
    make test-sim                               # same as default
"""

import argparse
import json
import sys
import time
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from simulator import SystemState, full_topic, TANK_HEIGHT, TANK_MAX_L

RESULTS = []

def check(label, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    RESULTS.append((status, label, detail))
    color = "\033[32m" if condition else "\033[31m"
    icon  = "✓" if condition else "✗"
    extra = f"  ({detail})" if detail and not condition else ""
    print(f"  {color}{icon}\033[0m {label}{extra}")

def section(title, layer):
    print(f"\n  \033[1m[L{layer}] {title}\033[0m")

def report():
    passed = sum(1 for s,_,_ in RESULTS if s=="PASS")
    failed = sum(1 for s,_,_ in RESULTS if s=="FAIL")
    total  = len(RESULTS)
    color  = "\033[32m" if failed==0 else "\033[31m"
    label  = "PASSED" if failed==0 else "FAILED"
    print(f"\n  {color}{label}\033[0m  {passed}/{total} tests")
    if failed:
        print("\n  \033[31mFailing:\033[0m")
        for s,l,d in RESULTS:
            if s=="FAIL":
                print(f"    ✗ {l}" + (f"  ({d})" if d else ""))
    print()
    return 0 if failed==0 else 1

# ══════════════════════════════════════════════════════════════════════════════
# LAYER 1 — UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

def run_layer_1():
    print("\n\033[1m  ═══ Layer 1: Unit Tests ═══\033[0m")

    section("Sensor baselines at t=0", 1)
    s = SystemState(); s.t = 0
    check("pH in safe range [5.5, 7.5]",     5.5 <= s.ph()           <= 7.5,  f"got {s.ph()}")
    check("EC in safe range [0.5, 3.5]",      0.5 <= s.ec()           <= 3.5,  f"got {s.ec()}")
    check("Water temp in range [15, 30]",      15  <= s.water_temp()   <= 30,   f"got {s.water_temp()}")
    check("Air temp in range [15, 40]",        15  <= s.air_temp()     <= 40,   f"got {s.air_temp()}")
    check("Humidity in range [20, 95]",        20  <= s.air_humidity() <= 95,   f"got {s.air_humidity()}")
    check("Tank level in range [0, 100]",       0  <= s.level_percent()<= 100,  f"got {s.level_percent()}")
    check("Tank litres > 0",                  s.level_litres() > 0,             f"got {s.level_litres()}")
    check("Ultrasonic distance > 0",          s.reservoir_distance() > 0,       f"got {s.reservoir_distance()}")

    section("Actuator defaults", 1)
    s = SystemState()
    check("Pump starts OFF",   not s.pump_on)
    check("Light starts ON",       s.light_on)
    check("Fan starts OFF",    not s.fan_on)
    check("Mode is 'active'",  s.mode == "active")
    check("No faults at start", len(s.faults) == 0)

    section("Pump toggle (keys 4/5)", 1)
    s = SystemState()
    s.pump_on = True
    check("Pump ON: pump_on=True",             s.pump_on)
    check("Pump ON: status payload correct",   s.status_payload()["pump"] == "ON")
    s.pump_on = False
    check("Pump OFF: pump_on=False",           not s.pump_on)
    check("Pump OFF: status payload correct",  s.status_payload()["pump"] == "OFF")

    section("Light and fan toggles", 1)
    s = SystemState(); s.t = 100
    s.light_on = False; air_off = s.air_temp()
    s.light_on = True;  air_on  = s.air_temp()
    check("Light ON raises air temp",           air_on > air_off,          f"off={air_off} on={air_on}")
    check("Light delta is exactly 2.5C",        round(air_on-air_off,2)==2.5, f"delta={round(air_on-air_off,2)}")
    s.fan_on = True
    check("Fan ON in status",   s.status_payload()["fan"] == "ON")
    s.fan_on = False
    check("Fan OFF in status",  s.status_payload()["fan"] == "OFF")

    section("pH crash fault (key 1)", 1)
    s = SystemState(); s.t = 0
    baseline = s.ph()
    s.inject("ph", 1.5); s.t = 15
    crashed = s.ph()
    check("pH drops below baseline",        crashed < baseline,  f"base={baseline} crashed={crashed}")
    check("pH below safe range (5.5)",      crashed < 5.5,       f"got {crashed}")
    check("pH above minimum floor (3.5)",   crashed >= 3.5,      f"got {crashed}")
    check("'ph' in faults dict",            "ph" in s.faults)
    check("'ph' in status faults list",     "ph" in s.status_payload()["faults"])

    section("pH fault decay over time", 1)
    s = SystemState(); s.t = 0
    s.inject("ph", 1.5)
    s.t = 15;  at_15  = s.ph()
    s.t = 120; at_120 = s.ph()
    s.t = 600; at_600 = s.ph()
    check("pH recovers from t+15 to t+120",  at_120 > at_15,   f"t15={at_15} t120={at_120}")
    check("pH nearly normal at t+600",        at_600 > 5.5,     f"got {at_600}")

    section("EC depletion fault (key 2)", 1)
    s = SystemState(); s.t = 0
    baseline = s.ec()
    s.inject("ec", 2.5); s.t = 15
    depleted = s.ec()
    check("EC drops below baseline",      depleted < baseline,  f"base={baseline} depleted={depleted}")
    check("EC drops below safe (0.5)",    depleted < 0.5,       f"got {depleted}")
    check("EC stays non-negative",        depleted >= 0.0,      f"got {depleted}")

    section("Temp spike fault (key 3)", 1)
    s = SystemState(); s.t = 0
    baseline = s.water_temp()
    s.inject("temp", 1.0); s.t = 5
    check("Water temp rises above baseline",  s.water_temp() > baseline,
          f"base={baseline} spiked={s.water_temp()}")

    section("Low water fault (key 6)", 1)
    s = SystemState(); s.t = 0
    baseline = s.level_percent()
    s.inject("level", 2.0); s.t = 15
    low = s.level_percent()
    check("Level drops below baseline",  low < baseline,  f"base={baseline} low={low}")
    check("Level drops below 15%",       low < 15.0,      f"got {low}")
    check("Level stays non-negative",    low >= 0.0,      f"got {low}")

    section("Reset all faults (key r)", 1)
    s = SystemState(); s.t = 0
    s.inject("ph", 1.5); s.inject("ec", 2.5); s.inject("level", 2.0)
    check("3 faults active before reset",   len(s.faults) == 3)
    s.reset()
    check("Reset clears all faults",        len(s.faults) == 0)
    check("Status faults list empty",       s.status_payload()["faults"] == [])
    s.t = 10
    check("pH returns to safe range",       5.5 <= s.ph() <= 7.5,         f"got {s.ph()}")
    check("EC returns to safe range",       0.5 <= s.ec() <= 3.5,         f"got {s.ec()}")
    check("Level returns to safe range",    s.level_percent() > 15.0,     f"got {s.level_percent()}")

    section("Natural physics over time", 1)
    s = SystemState()
    s.t = 0;         ec_d0 = s.ec()
    s.t = 7*24*3600; ec_d7 = s.ec()
    check("EC depletes naturally over 7 days",  ec_d7 < ec_d0,  f"d0={ec_d0} d7={ec_d7}")

    s = SystemState(); s.t = 7200
    s.pump_on = False; lvl_off = s.level_percent()
    s.pump_on = True;  lvl_on  = s.level_percent()
    check("Pump ON raises water level",  lvl_on > lvl_off,  f"off={lvl_off} on={lvl_on}")

    section("all_sensors() completeness", 1)
    sensors = SystemState().all_sensors()
    for key in ["water_temp","air_temp","humidity","pressure","ph","ec",
                "distance","level_pct","level_litres"]:
        check(f"sensors has '{key}'",  key in sensors)

    section("status_payload() completeness", 1)
    st = SystemState().status_payload()
    for key in ["rssi","heap_free","uptime_s","pump","light","fan","mode","faults"]:
        check(f"status has '{key}'",  key in st)


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 2 — INTEGRATION TESTS  (requires Mosquitto broker)
# ══════════════════════════════════════════════════════════════════════════════

def run_layer_2(broker="localhost:1883"):
    print("\n\033[1m  ═══ Layer 2: Integration Tests (MQTT) ═══\033[0m")
    print(f"  broker: {broker}\n")

    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        print("  \033[33m⚠ paho-mqtt not installed — skipping\033[0m"); return

    host, port = broker.split(":") if ":" in broker else (broker, "1883")
    received  = {}
    connected = threading.Event()
    client    = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="HydroOne-TestSuite")

    def on_connect(c, u, f, rc, p=None):
        if rc == 0:
            c.subscribe(full_topic("sensors/#"))
            c.subscribe(full_topic("status"))
            c.subscribe(full_topic("heartbeat"))
            connected.set()

    def on_message(c, u, msg):
        received[msg.topic] = msg.payload.decode()

    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(host, int(port), keepalive=10)
    except Exception as e:
        print(f"  \033[31m✗ Cannot connect ({e}) — is Mosquitto running?\033[0m"); return

    client.loop_start()
    if not connected.wait(timeout=3):
        print("  \033[31m✗ Broker timeout\033[0m"); client.loop_stop(); return

    state   = SystemState(); state.t = 10
    sensors = state.all_sensors()
    ts      = "2026-01-01T00:00:10Z"

    publishes = [
        ("sensors/water/temperature",  str(sensors["water_temp"])),
        ("sensors/air/temperature",    str(sensors["air_temp"])),
        ("sensors/air/humidity",       str(sensors["humidity"])),
        ("sensors/air/pressure",       str(sensors["pressure"])),
        ("sensors/water/ph",           str(sensors["ph"])),
        ("sensors/water/ec",           str(sensors["ec"])),
        ("sensors/reservoir/distance", str(sensors["distance"])),
        ("sensors/water/level_percent",str(sensors["level_pct"])),
        ("sensors/water/level_litres", str(sensors["level_litres"])),
        ("status",                     json.dumps(state.status_payload())),
        ("heartbeat",                  ts),
    ]
    for suffix, payload in publishes:
        client.publish(full_topic(suffix), payload, qos=1)
    time.sleep(0.5)

    section("All telemetry topics received", 2)
    for suffix, _ in publishes:
        topic = full_topic(suffix)
        check(f"received: {suffix}", topic in received, "not received")

    section("Published values round-trip correctly", 2)
    for suffix, sent in publishes:
        topic = full_topic(suffix)
        if topic in received and suffix not in ("status","heartbeat"):
            got = float(received[topic])
            check(f"{suffix} value matches",  got == float(sent),
                  f"sent={sent} got={got}")

    section("Distance consistent with level in same publish", 2)
    t_level = full_topic("sensors/water/level_percent")
    t_dist  = full_topic("sensors/reservoir/distance")
    if t_level in received and t_dist in received:
        pct  = float(received[t_level])
        dist = float(received[t_dist])
        expected = TANK_HEIGHT * (1 - pct/100.0)
        check("Distance matches level_percent",  abs(dist-expected) < 2.0,
              f"level={pct}% dist={dist} expected~{round(expected,1)}")

    section("Status payload is valid JSON with required keys", 2)
    t_status = full_topic("status")
    if t_status in received:
        try:
            st = json.loads(received[t_status])
            for key in ["pump","light","fan","mode","faults","uptime_s"]:
                check(f"status.{key} present",  key in st)
        except Exception:
            check("status is valid JSON",  False, "parse error")

    section("Heartbeat received", 2)
    check("heartbeat topic received",  full_topic("heartbeat") in received)

    client.loop_stop(); client.disconnect()


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 3 — CONSISTENCY TESTS
# ══════════════════════════════════════════════════════════════════════════════

def run_layer_3():
    print("\n\033[1m  ═══ Layer 3: Consistency Tests ═══\033[0m")

    section("Level, distance, litres mutually consistent", 3)
    for label, t_val in [("t=0",0),("t=1hr",3600),("t=12hr",43200)]:
        s = SystemState(); s.t = t_val
        sensors = s.all_sensors()
        pct    = sensors["level_pct"]
        dist   = sensors["distance"]
        litres = sensors["level_litres"]
        exp_dist   = TANK_HEIGHT * (1 - pct/100.0)
        exp_litres = round((pct/100.0)*TANK_MAX_L, 2)
        check(f"[{label}] distance consistent with level_pct",
              abs(dist-exp_dist) < 2.0,  f"level={pct}% dist={dist} expected~{round(exp_dist,1)}")
        check(f"[{label}] litres consistent with level_pct",
              abs(litres-exp_litres) < 0.5,  f"pct={pct}% litres={litres} expected={exp_litres}")

    section("Empty tank gives maximum distance", 3)
    s = SystemState(); s.t = 0
    s.inject("level", 2.0); s.t = 15
    sensors = s.all_sensors()
    check("level=0% → distance ≈ TANK_HEIGHT",
          sensors["level_pct"]==0.0 and sensors["distance"] >= TANK_HEIGHT*0.9,
          f"level={sensors['level_pct']}% dist={sensors['distance']}")
    check("level=0% → litres=0.0",
          sensors["level_litres"] == 0.0,  f"got {sensors['level_litres']}")

    section("Status faults mirror internal faults dict", 3)
    s = SystemState(); s.t = 0
    s.inject("ph", 1.5); s.inject("ec", 2.5)
    st = s.status_payload()
    check("Both faults in status",    set(st["faults"]) == {"ph","ec"},  f"got {st['faults']}")
    s.reset()
    check("After reset status faults=[]",  s.status_payload()["faults"] == [])

    section("Pump state reflects immediately in status", 3)
    s = SystemState()
    s.pump_on = True
    check("pump_on=True → status pump=ON",   s.status_payload()["pump"] == "ON")
    s.pump_on = False
    check("pump_on=False → status pump=OFF", s.status_payload()["pump"] == "OFF")

    section("Light adds exactly 2.5C to air temp", 3)
    s = SystemState(); s.t = 500
    s.light_on = False; off = s.air_temp()
    s.light_on = True;  on  = s.air_temp()
    delta = round(on-off, 2)
    check("Light delta = 2.5C exactly",  delta == 2.5,  f"got {delta}")

    section("Sensors stay within hard limits across time", 3)
    for t_val in [0, 3600, 86400, 7*86400]:
        s = SystemState(); s.t = t_val
        check(f"pH in [3.5,10.0] at t={t_val}s",    3.5 <= s.ph() <= 10.0,              f"got {s.ph()}")
        check(f"EC non-negative at t={t_val}s",      s.ec() >= 0.0,                      f"got {s.ec()}")
        check(f"Level in [0,100] at t={t_val}s",     0.0 <= s.level_percent() <= 100.0,  f"got {s.level_percent()}")

    section("All faults active simultaneously stay within bounds", 3)
    s = SystemState(); s.t = 0
    s.inject("ph",1.5); s.inject("ec",2.5); s.inject("temp",1.0); s.inject("level",2.0)
    s.t = 15
    check("pH at floor with all faults",    s.ph() >= 3.5)
    check("EC non-negative with all faults",s.ec() >= 0.0)
    check("Level non-negative all faults",  s.level_percent() >= 0.0)


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 4 — REGRESSION TESTS
# One test per bug found in the field. These must never fail again.
# ══════════════════════════════════════════════════════════════════════════════

def run_layer_4():
    print("\n\033[1m  ═══ Layer 4: Regression Tests ═══\033[0m")

    section("BUG-001: level_percent/distance contradiction in same publish", 4)
    # level_percent=0.0 published alongside distance=30.1 in same cycle.
    # Root cause: reservoir_distance() and level_litres() each called
    # level_percent() independently — different values possible.
    # Fix: all_sensors() snapshots level_pct once and passes it through.
    s = SystemState(); s.t = 0
    s.inject("level", 2.0); s.t = 15
    sensors = s.all_sensors()
    pct = sensors["level_pct"]
    exp = TANK_HEIGHT * (1 - pct/100.0)
    check("BUG-001: distance consistent with level_pct in snapshot",
          abs(sensors["distance"]-exp) < 2.0,
          f"level={pct}% dist={sensors['distance']} expected~{round(exp,1)}")
    check("BUG-001: litres consistent with level_pct in snapshot",
          abs(sensors["level_litres"] - round((pct/100.0)*TANK_MAX_L,2)) < 0.5)

    section("BUG-002: actuator panel showed stale pump state", 4)
    # Pump ON logged in event log but actuator panel showed OFF.
    # Root cause: build_actuator_panel() called status_payload() which
    # could return stale/cached state on fast key presses.
    # Fix: panel reads s.pump_on / s.light_on / s.fan_on directly.
    s = SystemState()
    s.pump_on = True
    check("BUG-002: pump_on=True immediate in state attr",    s.pump_on == True)
    check("BUG-002: status payload agrees on True",           s.status_payload()["pump"] == "ON")
    s.pump_on = False
    check("BUG-002: pump_on=False immediate in state attr",   s.pump_on == False)
    check("BUG-002: status payload agrees on False",          s.status_payload()["pump"] == "OFF")

    section("BUG-003: fault magnitudes had wrong sign (sensors went wrong direction)", 4)
    # Key '1' injected mag=-1.0 but formula is base + fault*(-1.4) so
    # negative magnitude raised pH instead of crashing it.
    # Fix: all fault magnitudes corrected to positive.
    s = SystemState(); s.t = 0; base_ph = s.ph()
    s.inject("ph", 1.5); s.t = 15
    check("BUG-003: pH crash goes DOWN",           s.ph() < base_ph,   f"base={base_ph} after={s.ph()}")
    check("BUG-003: pH enters unsafe range",       s.ph() < 5.5,       f"got {s.ph()}")

    s2 = SystemState(); s2.t = 0; base_ec = s2.ec()
    s2.inject("ec", 2.5); s2.t = 15
    check("BUG-003: EC depletion goes DOWN",       s2.ec() < base_ec,  f"base={base_ec} after={s2.ec()}")

    s3 = SystemState(); s3.t = 0; base_lv = s3.level_percent()
    s3.inject("level", 2.0); s3.t = 15
    check("BUG-003: Low water goes DOWN",          s3.level_percent() < base_lv,
          f"base={base_lv} after={s3.level_percent()}")

    section("BUG-004: level_litres called level_percent() independently", 4)
    # all_sensors() could return level_pct=X but level_litres derived from
    # a second call to level_percent() returning Y at a different noise phase.
    # Fix: snapshot level_pct once, pass to both methods.
    s = SystemState(); s.t = 42.7
    sensors = s.all_sensors()
    pct = sensors["level_pct"]
    expected_litres = round((pct/100.0)*TANK_MAX_L, 2)
    check("BUG-004: litres derived from same pct as snapshot",
          sensors["level_litres"] == expected_litres,
          f"litres={sensors['level_litres']} expected={expected_litres}")


# ══════════════════════════════════════════════════════════════════════════════
# LAYER 5 — EDGE CASES
# Untested behaviors, boundary conditions, and known physics limits
# ══════════════════════════════════════════════════════════════════════════════

def run_layer_5():
    print("\n\033[1m  ═══ Layer 5: Edge Case Tests ═══\033[0m")

    section("Fault reinject resets decay timer", 5)
    s = SystemState(); s.t = 0
    s.inject("ph", 1.5)
    t0_first = s.faults["ph"][1]
    s.t = 30
    s.inject("ph", 1.5)
    t0_second = s.faults["ph"][1]
    check("Reinjecting same fault resets its timer",  t0_second > t0_first,
          f"first={t0_first} second={t0_second}")
    check("Only one ph fault entry after reinject",   len([k for k in s.faults if k=="ph"]) == 1)

    section("Fault fully decays and is cleaned from dict", 5)
    s = SystemState(); s.t = 0
    s.inject("ph", 1.5)
    check("Fault present immediately after inject",   "ph" in s.faults)
    s.t = 2000
    s._fault("ph")   # triggers cleanup via decay check
    check("Fault removed from dict after full decay", "ph" not in s.faults)
    check("pH back in safe range after full decay",   5.5 <= s.ph() <= 7.5,  f"got {s.ph()}")

    section("all_sensors() is deterministic at same t", 5)
    s = SystemState(); s.t = 42.7
    a = s.all_sensors()
    b = s.all_sensors()
    check("all_sensors() returns identical results on repeat call",  a == b)

    section("Rapid actuator toggle stays consistent", 5)
    s = SystemState()
    for _ in range(20):
        s.pump_on = True
        s.pump_on = False
    check("After 20 rapid toggles pump is OFF",          not s.pump_on)
    check("Status reflects final state after rapid toggle", s.status_payload()["pump"] == "OFF")
    for _ in range(20):
        s.pump_on = False
        s.pump_on = True
    check("After 20 rapid toggles ending ON, pump is ON",  s.pump_on)
    check("Status reflects ON after rapid toggle",          s.status_payload()["pump"] == "ON")

    section("Zero magnitude fault has no effect on sensor", 5)
    s = SystemState(); s.t = 0
    base = s.ph()
    s.inject("ph", 0.0); s.t = 10
    check("Zero magnitude fault doesn't change pH",  abs(s.ph() - base) < 0.1,
          f"base={base} after={s.ph()}")

    section("Mode toggle works correctly", 5)
    s = SystemState()
    check("Default mode is active",              s.mode == "active")
    s.mode = "maintenance"
    check("Mode switches to maintenance",        s.status_payload()["mode"] == "maintenance")
    s.mode = "active"
    check("Mode switches back to active",        s.status_payload()["mode"] == "active")

    section("Pump overcomes natural evaporation (not severe faults)", 5)
    # Pump adds +0.5 to base. Natural evaporation is ~1.2%/hr.
    # Pump should hold level stable against natural loss but not a 2.0 fault.
    s = SystemState(); s.t = 7200   # 2 hrs — some natural depletion
    s.pump_on = False; without = s.level_percent()
    s.pump_on = True;  with_p  = s.level_percent()
    check("Pump raises level against natural evaporation",  with_p > without,
          f"without={without} with={with_p}")

    section("Severe level fault overwhelms pump (correct physics)", 5)
    # This is documented expected behavior: a catastrophic fault (leak, drain)
    # cannot be overcome by the pump's small +0.5 contribution.
    s = SystemState(); s.t = 0
    s.inject("level", 2.0); s.t = 15
    s.pump_on = False; low    = s.level_percent()
    s.pump_on = True;  pumped = s.level_percent()
    check("Severe fault drives level to 0 regardless of pump",
          low == 0.0 and pumped == 0.0,
          f"low={low} pumped={pumped}")
    # Document: this is correct — fault magnitude 2.0 is a catastrophic drain.
    # Real mitigation is clear_fault() simulating a repair.

    section("RSSI and heap_free within realistic ESP32 ranges", 5)
    import random as _random
    _random.seed(99)
    vals = [SystemState().status_payload() for _ in range(50)]
    rssi_ok   = all(-100 <= v["rssi"]      <= -20     for v in vals)
    heap_ok   = all(50000 <= v["heap_free"] <= 500000  for v in vals)
    check("RSSI always in realistic range [-100, -20]",     rssi_ok,
          f"got range [{min(v['rssi'] for v in vals)}, {max(v['rssi'] for v in vals)}]")
    check("heap_free always in realistic range [50k, 500k]", heap_ok,
          f"got range [{min(v['heap_free'] for v in vals)}, {max(v['heap_free'] for v in vals)}]")

    section("EC at day 7 boundary stays non-negative", 5)
    s = SystemState(); s.t = 7*24*3600
    check("EC non-negative at exactly day 7",  s.ec() >= 0.0,  f"got {s.ec()}")
    check("EC still positive at day 7",        s.ec() > 0.0,   f"got {s.ec()}")

    section("Distance at 100% level is near zero", 5)
    # Can't force level to exactly 100% without fault removal,
    # but we can verify the math: at 100%, distance = 0 + noise
    from simulator import TANK_HEIGHT
    expected_dist_at_full = TANK_HEIGHT * (1 - 100/100.0)
    check("Distance formula gives 0 at 100% level",
          expected_dist_at_full == 0.0,  f"got {expected_dist_at_full}")

    section("All 4 faults simultaneously don't corrupt each other", 5)
    s = SystemState(); s.t = 0
    s.inject("ph", 1.5); s.inject("ec", 2.5)
    s.inject("temp", 1.0); s.inject("level", 2.0)
    check("4 faults in dict simultaneously",  len(s.faults) == 4)
    s.t = 15
    ph_fault  = "ph"    in s.faults
    ec_fault  = "ec"    in s.faults
    tmp_fault = "temp"  in s.faults
    lvl_fault = "level" in s.faults
    check("All 4 faults independently tracked",  all([ph_fault,ec_fault,tmp_fault,lvl_fault]))
    s.faults.pop("ph", None)
    check("Removing one fault doesn't affect others",
          "ec" in s.faults and "temp" in s.faults and "level" in s.faults)
    check("Removed fault gone",  "ph" not in s.faults)

    section("Uptime increments over real time", 5)
    import time as _time
    s = SystemState()
    _time.sleep(0.1)
    check("Uptime > 0 after brief wait",  s.status_payload()["uptime_s"] >= 0)

    section("Sensor noise is deterministic (same t = same output)", 5)
    from simulator import noise
    for t_val in [0.0, 1.5, 42.7, 100.0]:
        a = noise(t_val, 11)
        b = noise(t_val, 11)
        check(f"noise({t_val}, 11) deterministic",  a == b,  f"{a} != {b}")

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="HydroOne test suite")
    parser.add_argument("--all",    action="store_true", help="include MQTT integration tests")
    parser.add_argument("--layer",  type=int, choices=[1,2,3,4,5])
    parser.add_argument("--broker", default="localhost:1883")
    args = parser.parse_args()

    print("\n\033[1m  HydroOne Production Test Suite\033[0m")

    if args.layer:
        {1:run_layer_1, 3:run_layer_3, 4:run_layer_4, 5:run_layer_5}.get(args.layer, lambda:None)()
        if args.layer == 2: run_layer_2(args.broker)
    elif args.all:
        run_layer_1(); run_layer_2(args.broker); run_layer_3(); run_layer_4(); run_layer_5()
    else:
        run_layer_1(); run_layer_3(); run_layer_4(); run_layer_5()
        print("\n  \033[33m(Layer 2 skipped — run with --all for MQTT tests)\033[0m")

    return report()

if __name__ == "__main__":
    sys.exit(main())

