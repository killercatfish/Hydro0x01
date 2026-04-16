# HydroOne Developer Makefile
# Usage: make <target>

BROKER      = localhost:1883
MOSQUITTO   = $(shell find /usr/local /opt/homebrew -name mosquitto -type f 2>/dev/null | head -1)
VENV        = .venv
PYTHON      = $(VENV)/bin/python
PIP         = $(VENV)/bin/pip
SCENARIO    ?= scenarios/ph_crash_recovery.yaml
SPEED       ?= 1

.PHONY: help setup _broker_start sim sim-offline scenario scenario-live test clean

help:
	@echo ""
	@echo "  HydroOne dev tools"
	@echo ""
	@echo "  make setup       create venv and install dependencies"
	@echo "  make sim         start broker + interactive simulator"
	@echo "  make sim-offline run simulator without MQTT"
	@echo "  make scenario    run a scenario (SCENARIO=path SPEED=10)"
	@echo "  make test        run all scenarios and report"
	@echo "  make clean       remove venv"
	@echo ""

setup:
	python3 -m venv $(VENV)
	$(PIP) install --upgrade pip -q
	$(PIP) install -r tools/requirements.txt pyyaml
	@echo "✓ venv ready"

_broker_start:
	@if [ -z "$(MOSQUITTO)" ]; then \
		echo "Mosquitto not found. Run: brew install mosquitto"; exit 1; \
	fi
	@if ! nc -z localhost 1883 2>/dev/null; then \
		echo "Starting Mosquitto..."; \
		$(MOSQUITTO) &>/tmp/mosquitto.log & \
		sleep 1; \
		echo "✓ Mosquitto running (logs: /tmp/mosquitto.log)"; \
	else \
		echo "✓ Mosquitto already running"; \
	fi

sim: _broker_start
	$(PYTHON) tools/simulator.py --broker $(BROKER)

sim-offline:
	$(PYTHON) tools/simulator.py --no-mqtt

scenario:
	$(PYTHON) tools/scenario_runner.py $(SCENARIO) --no-mqtt --speed $(SPEED)

scenario-live: _broker_start
	$(PYTHON) tools/scenario_runner.py $(SCENARIO) --broker $(BROKER) --speed $(SPEED)

test-sim:
	$(PYTHON) tools/test_simulator.py

test:
	@echo ""
	@echo "Running all scenarios..."
	@echo ""
	@for f in scenarios/*.yaml; do \
		$(PYTHON) tools/scenario_runner.py $$f --no-mqtt --speed 30 2>&1 | \
		grep -E "PASSED|FAILED|assertions"; \
	done
	@echo ""

clean:
	rm -rf $(VENV)
