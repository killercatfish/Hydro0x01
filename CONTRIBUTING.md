# Contributing to HydroOne

First off, thank you for considering contributing to HydroOne! It's people like you that make HydroOne such a great tool for the hydroponics community.

## 🚀 How Can I Contribute?

### Reporting Bugs
- Use the GitHub Issue Tracker.
- Describe the bug and include steps to reproduce.
- Mention your hardware setup (ESP32 type, sensors used).

### Suggesting Enhancements
- Open an issue with the "feature request" tag.
- Explain why the feature would be useful.

### Pull Requests
1. Fork the repo and create your branch from `main`.
2. Hardware changes? Update `docs/02_HARDWARE_SETUP.md`.
3. Firmware changes? Ensure code is compatible with the modular sensor architecture.
4. UI changes? Maintain the glassmorphism aesthetic.
5. Simulator changes? Run `make test-sim` and ensure all tests pass before submitting.
6. Create a PR with a clear description of your changes.

## 🛠️ Development Environment

### No Hardware? No Problem.
HydroOne includes a full CLI simulator so you can develop and test the entire stack without a physical ESP32. See [docs/09_SIMULATOR_GUIDE.md](docs/09_SIMULATOR_GUIDE.md) for setup.

```bash
# One-command setup
make setup

# Start the simulator (auto-starts Mosquitto broker)
make sim

# Run the full test suite (129 tests, no broker needed)
make test-sim
```

### Firmware
- We use **PlatformIO**.
- Please run `pio run` to verify compilation before submitting.

### Backend
- Node.js + Fastify + Prisma.
- Run `npm test` (if applicable) and ensure `npx prisma generate` is run after schema changes.

### Frontend
- React + Vite + Tailwind CSS.
- Keep components small and focused.

### Simulator & Tools
- Python 3.10+, `paho-mqtt`, `rich`, `pyyaml`.
- Run `make test-sim` before every PR — all 129 tests must pass.
- New features should include corresponding tests in `tools/test_simulator.py`.
- New fault scenarios should include a matching YAML file in `scenarios/`.

### Hardware (PCB & 3D Design)
HydroOne is a physical system, and hardware contributions are highly encouraged!
- **PCBs / Schematics**: Please submit designs in KiCad format. Include gerber files for easy viewing.
- **3D Printed Parts**: If contributing sensor mounts or waterproof enclosures, please provide `.STL` files and ideally the original CAD files (STEP, Fusion360, FreeCAD) so others can modify them.
- Ensure all 3D designs mention the recommended material (e.g., PETG or ABS for UV/water resistance versus PLA).

## ⚖️ Code of Conduct
Please be respectful and patient. We are a community of growers and developers helping each other.

---

Built with ❤️ for sustainable farming.
