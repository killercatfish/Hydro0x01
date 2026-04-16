# Simulator Guide

HydroOne includes a full hardware-free development environment. You can run the complete stack — MQTT telemetry, backend, dashboard — without a physical ESP32.

## Overview

| Tool | Purpose |
|------|---------|
| `tools/simulator.py` | Interactive CLI simulator — publishes live sensor telemetry |
| `tools/scenario_runner.py` | Automated YAML scenario runner for testing |
| `tools/test_simulator.py` | 5-layer production test suite (129 tests) |
| `Makefile` | One-command dev workflow |

---

## Setup

```bash
# Clone and enter the repo
git clone https://github.com/40rbidd3n/Hydro0x01.git
cd Hydro0x01

# Create venv and install dependencies
make setup

# Activate venv
source .venv/bin/activate
```

### Install Mosquitto (MQTT broker)

**macOS:**
```bash
brew install mosquitto
```

> Note: `make sim` auto-starts Mosquitto for you — no manual step needed.

**Linux:**
```bash
sudo apt install mosquitto
```

---

## Interactive Simulator

The simulator publishes fake ESP32 telemetry on the exact MQTT topic schema defined in [MQTT_GUIDE.md](MQTT_GUIDE.md). Use it instead of real hardware for frontend and backend development.

```bash
# Start broker + simulator in one command
make sim

# Offline mode — no broker needed
make sim-offline

# Against a remote broker
python tools/simulator.py --broker 192.168.1.10:1883
```

### Terminal UI

The simulator displays a live split-pane terminal UI:

```
┌─ sensors ──────────────┐  ┌─ published ──────────────────────────────┐
│ Water pH    6.07       │  │ → sensors/water/ph 6.07                  │
│ Water EC    1.61 mS/cm │  │ → sensors/water/ec 1.61                  │
│ Water Temp  20.8 °C    │  │ → sensors/water/level_percent 78.7       │
│ Air Temp    28.8 °C    │  │ → sensors/water/temperature 20.8         │
│ Humidity    71.6 %     │  └──────────────────────────────────────────┘
├─ actuators ────────────┤  ┌─ event log ──────────────────────────────┐
│ Pump  □ OFF            │  │ 08:06:05 MQTT connected                  │
│ Light ■ ON             │  │ 08:06:34 FAULT: Low water injected       │
│ Fan   □ OFF            │  │ 08:06:51 pump ON (manual)                │
│ Mode  active           │  └──────────────────────────────────────────┘
└────────────────────────┘
```

### Keyboard Controls

| Key | Action |
|-----|--------|
| `1` | Inject pH crash |
| `2` | Inject EC depletion |
| `3` | Inject temp spike |
| `4` | Pump on |
| `5` | Pump off |
| `6` | Low water event |
| `r` | Reset all faults |
| `q` | Quit |

### Verifying MQTT output

In a second terminal:
```bash
mosquitto_sub -h localhost -t "HydroOne/#" -v
```

You should see all 9 sensor topics streaming every 2 seconds.

---

## Scenario Runner

Scenarios are YAML files that define scripted sequences of faults and assertions. The runner plays them back automatically — no keyboard required. Use this for CI testing or reproducing specific conditions.

```bash
# Run a scenario offline (fastest)
make scenario SCENARIO=scenarios/ph_crash_recovery.yaml SPEED=10

# Run against a live broker
make scenario-live SCENARIO=scenarios/ec_depletion.yaml

# List all available scenarios
python tools/scenario_runner.py --list
```

### Included Scenarios

| File | Description | Duration |
|------|-------------|---------|
| `ph_crash_recovery.yaml` | pH drops, backend responds, system recovers | 3 min |
| `ec_depletion.yaml` | Nutrients deplete, dosing command expected | 2 min |
| `low_water_alert.yaml` | Reservoir runs low, pump activates, refills | 2.5 min |

### Writing a Scenario

```yaml
name: my_scenario
description: What this tests
duration: 120        # total scenario length in seconds
author: your-handle

steps:
  - at: 5
    action: assert_sensor
    sensor: ph
    op: in_range
    min: 5.5
    max: 7.5

  - at: 30
    action: inject_fault
    sensor: ph
    magnitude: 1.5    # positive = sensor crashes down

  - at: 45
    action: assert_sensor
    sensor: ph
    op: lt
    value: 5.5

  - at: 60
    action: assert_cmd   # checks if backend sent a response
    cmd: ph
    since: 30

  - at: 90
    action: clear_fault
    sensor: ph

  - at: 120
    action: log
    message: "Recovery complete"
```

**Available actions:** `inject_fault`, `clear_fault`, `clear_all_faults`, `set_pump`, `set_light`, `set_fan`, `set_mode`, `assert_sensor`, `assert_cmd`, `assert_status`, `wait`, `log`

**Available sensors for faults:** `ph`, `ec`, `temp`, `level`, `humidity`

**Fault magnitude note:** All magnitudes are positive values. The physics engine applies the correct direction internally (e.g., `magnitude: 1.5` on `ph` crashes pH downward).

---

## Test Suite

The test suite runs 129 automated tests across 5 layers with no broker or human interaction required.

```bash
# Run layers 1, 3, 4, 5 (no broker needed)
make test-sim

# Run all layers including MQTT integration (needs Mosquitto)
python tools/test_simulator.py --all

# Run a single layer
python tools/test_simulator.py --layer 3

# Run all scenarios and print pass/fail summary
make test
```

### Test Layers

| Layer | Name | Tests | Requires |
|-------|------|-------|---------|
| 1 | Unit | ~55 | Nothing |
| 2 | Integration | ~18 | Mosquitto |
| 3 | Consistency | ~25 | Nothing |
| 4 | Regression | ~13 | Nothing |
| 5 | Edge Cases | ~18 | Nothing |

**Layer 1 — Unit:** State transitions, sensor physics, fault injection, actuator toggles, payload completeness.

**Layer 2 — Integration:** Actual MQTT publish/subscribe round-trip. Verifies all 9 topics arrive at broker with correct values. Requires Mosquitto running.

**Layer 3 — Consistency:** Cross-sensor sanity checks. Ensures `level_percent`, `distance`, and `level_litres` are always derived from the same snapshot. Validates sensor floor/ceiling limits across 7 days of sim time.

**Layer 4 — Regression:** One test per bug found in the field. These never fail again.

| Bug | Description |
|-----|-------------|
| BUG-001 | `level_percent` and `distance` contradicted each other in same MQTT publish |
| BUG-002 | Actuator panel showed stale pump state after keyboard input |
| BUG-003 | Fault magnitudes had wrong sign — sensors went wrong direction |
| BUG-004 | `level_litres` called `level_percent()` independently, could return inconsistent value |

**Layer 5 — Edge Cases:** Fault reinject timer reset, fault cleanup after full decay, rapid actuator toggling, zero magnitude fault, simultaneous faults, RSSI/heap_free ranges, noise determinism.

---

## Makefile Reference

```bash
make setup          # create venv and install all dependencies
make sim            # auto-start Mosquitto + launch interactive simulator
make sim-offline    # simulator with no broker
make scenario       # run default scenario (SCENARIO=path SPEED=N)
make scenario-live  # run scenario against live broker
make test-sim       # run 5-layer test suite
make test           # run all YAML scenarios and print pass/fail
make clean          # remove venv
```

---

## Tips

**Speed up scenario playback:**
```bash
make scenario SPEED=10   # 1 hour of sim time in 6 real minutes
```

**Watch MQTT traffic while a scenario runs:**
```bash
# Terminal 1
mosquitto_sub -h localhost -t "HydroOne/#" -v

# Terminal 2
make scenario-live SCENARIO=scenarios/ph_crash_recovery.yaml SPEED=5
```

**Add a test for every bug you find:**
Open `tools/test_simulator.py`, add a section to Layer 4 with the bug number and a clear description. Run `make test-sim` to confirm it catches the regression.
