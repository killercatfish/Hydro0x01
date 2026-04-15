# HydroOne Tools

## simulator.py

A CLI simulator that publishes fake ESP32 telemetry on the exact MQTT topic
schema used by HydroOne firmware. Use this to develop and demo the full stack
without physical hardware.

### Install
pip install paho-mqtt rich

### Usage

Offline demo — no broker needed:
python tools/simulator.py --no-mqtt

Against a local Mosquitto broker:
python tools/simulator.py --broker localhost:1883

Against the public test broker:
python tools/simulator.py --broker test.mosquitto.org:1883

### Keyboard controls
1  Inject pH crash
2  Inject EC depletion
3  Inject temp spike
4  Pump on
5  Pump off
6  Low water event
r  Reset all faults
q  Quit