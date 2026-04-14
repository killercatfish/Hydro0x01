/**
 * @file EnvironmentManager.cpp
 * @brief Implementation of environmental orchestration logic
 * 
 * All timing uses millis() — fully non-blocking.
 */

#include "EnvironmentManager.h"

// Global instance
EnvironmentManager envManager;

extern SensorData sensorData;
extern SystemConfig sysConfig;
extern SystemStatus systemStatus;

EnvironmentManager::EnvironmentManager()
    : _fanOn(false),
      _dosingLocked(false),
      _lastDoseTime(0),
      _phDownActive(false),
      _phUpActive(false),
      _doseStartTime(0),
      _nutrientState(NUT_IDLE),
      _nutrientLocked(false),
      _nutrientStepTime(0),
      _lightOn(false),
      _lightOverrideActive(false),
      _lightOverrideState(false) {
}

void EnvironmentManager::begin() {
    LOG_INFO("EnvironmentManager: Initializing...");

    // Ensure all environment relays start OFF
    allOff();

    LOG_INFO("EnvironmentManager: Fan %s | pH Dosing %s | Nutrient Dosing %s | Lighting %s",
             sysConfig.fanEnabled             ? "ENABLED" : "DISABLED",
             sysConfig.dosingEnabled           ? "ENABLED" : "DISABLED",
             sysConfig.nutrientDosingEnabled   ? "ENABLED" : "DISABLED",
             sysConfig.lightingEnabled         ? "ENABLED" : "DISABLED");

    LOG_INFO("EnvironmentManager: Initialized");
}

void EnvironmentManager::loop() {
    // Don't actuate anything during maintenance or emergency
    if (systemStatus.state == STATE_MAINTENANCE || systemStatus.state == STATE_EMERGENCY) {
        allOff();
        return;
    }

    handleFanControl();
    handlePhDosing();
    handleNutrientDosing();
    handleLighting();
}

// ============================================================================
// FAN CONTROL — Temperature-based with hysteresis
// ============================================================================
void EnvironmentManager::handleFanControl() {
    if (!sysConfig.fanEnabled || !sysConfig.fanAutoMode) return;

    // Validate sensor data
    if (!sensorData.valid) return;

    float tempOn  = sysConfig.airTempMax;
    float tempOff = sysConfig.airTempMax - sysConfig.fanHysteresis;

    if (!_fanOn && sensorData.airTemp > tempOn) {
        // Too hot — turn fan ON
        relayManager.setRelay(RELAY_FAN, true);
        _fanOn = true;
        LOG_INFO("EnvMgr: Fan ON (air temp %.1f°C > %.1f°C)", sensorData.airTemp, tempOn);
    }
    else if (_fanOn && sensorData.airTemp < tempOff) {
        // Cooled down — turn fan OFF
        relayManager.setRelay(RELAY_FAN, false);
        _fanOn = false;
        LOG_INFO("EnvMgr: Fan OFF (air temp %.1f°C < %.1f°C)", sensorData.airTemp, tempOff);
    }
}

// ============================================================================
// pH DOSING — Pulse-based with non-blocking lockout
// ============================================================================
void EnvironmentManager::handlePhDosing() {
    if (!sysConfig.dosingEnabled) return;
    if (!sensorData.valid) return;

    unsigned long now = millis();

    // --- Active dose pulse management ---
    // If a dose relay is currently firing, check if the pulse duration has elapsed
    if (_phDownActive) {
        if (now - _doseStartTime >= sysConfig.dosingPulseMs) {
            relayManager.setRelay(RELAY_PH_DOWN, false);
            _phDownActive = false;
            _dosingLocked = true;
            _lastDoseTime = now;
            LOG_INFO("EnvMgr: pH DOWN pulse complete. Lockout started (%lu ms)", sysConfig.dosingLockoutMs);
        }
        return; // Don't start new doses while one is active
    }

    if (_phUpActive) {
        if (now - _doseStartTime >= sysConfig.dosingPulseMs) {
            relayManager.setRelay(RELAY_PH_UP, false);
            _phUpActive = false;
            _dosingLocked = true;
            _lastDoseTime = now;
            LOG_INFO("EnvMgr: pH UP pulse complete. Lockout started (%lu ms)", sysConfig.dosingLockoutMs);
        }
        return; // Don't start new doses while one is active
    }

    // --- Lockout check ---
    if (_dosingLocked) {
        if (now - _lastDoseTime >= sysConfig.dosingLockoutMs) {
            _dosingLocked = false;
            LOG_DEBUG("EnvMgr: Dosing lockout expired. Ready for next dose.");
        } else {
            return; // Still in lockout — wait for chemicals to mix
        }
    }

    // --- Evaluate pH and trigger a dose if needed ---
    if (sensorData.pH > sysConfig.phTargetMax) {
        // pH too high — dose acid (pH DOWN)
        relayManager.setRelay(RELAY_PH_DOWN, true);
        _phDownActive = true;
        _doseStartTime = now;
        LOG_INFO("EnvMgr: pH HIGH (%.2f > %.2f). Pulsing pH DOWN for %lu ms",
                 sensorData.pH, sysConfig.phTargetMax, sysConfig.dosingPulseMs);
    }
    else if (sensorData.pH < sysConfig.phTargetMin) {
        // pH too low — dose base (pH UP)
        relayManager.setRelay(RELAY_PH_UP, true);
        _phUpActive = true;
        _doseStartTime = now;
        LOG_INFO("EnvMgr: pH LOW (%.2f < %.2f). Pulsing pH UP for %lu ms",
                 sensorData.pH, sysConfig.phTargetMin, sysConfig.dosingPulseMs);
    }
}

// ============================================================================
// NUTRIENT A/B DOSING — Sequential pulse state machine
// ============================================================================
void EnvironmentManager::handleNutrientDosing() {
    if (!sysConfig.nutrientDosingEnabled) return;
    if (!sensorData.valid) return;

    unsigned long now = millis();

    switch (_nutrientState) {
        case NUT_IDLE:
            // Only dose if EC is below minimum target
            if (sensorData.ec < sysConfig.ecTargetMin) {
                // Start dosing Nutrient A
                relayManager.setRelay(RELAY_NUTRIENT_A, true);
                _nutrientState = NUT_DOSING_A;
                _nutrientStepTime = now;
                LOG_INFO("EnvMgr: EC LOW (%.2f < %.2f). Pulsing Nutrient A for %lu ms",
                         sensorData.ec, sysConfig.ecTargetMin, sysConfig.dosingPulseMs);
            }
            else if (sensorData.ec > sysConfig.ecTargetMax) {
                // EC too high — log warning only (dilution is manual)
                LOG_WARN("EnvMgr: EC HIGH (%.2f > %.2f). Manual dilution recommended.",
                         sensorData.ec, sysConfig.ecTargetMax);
            }
            break;

        case NUT_DOSING_A:
            // Nutrient A pulse complete?
            if (now - _nutrientStepTime >= sysConfig.dosingPulseMs) {
                relayManager.setRelay(RELAY_NUTRIENT_A, false);
                _nutrientState = NUT_DELAY_A_TO_B;
                _nutrientStepTime = now;
                LOG_INFO("EnvMgr: Nutrient A pulse complete. Waiting %lu ms before B.",
                         sysConfig.nutrientDoseDelayMs);
            }
            break;

        case NUT_DELAY_A_TO_B:
            // Wait between A and B to prevent direct mixing in the tube
            if (now - _nutrientStepTime >= sysConfig.nutrientDoseDelayMs) {
                relayManager.setRelay(RELAY_NUTRIENT_B, true);
                _nutrientState = NUT_DOSING_B;
                _nutrientStepTime = now;
                LOG_INFO("EnvMgr: Pulsing Nutrient B for %lu ms", sysConfig.dosingPulseMs);
            }
            break;

        case NUT_DOSING_B:
            // Nutrient B pulse complete?
            if (now - _nutrientStepTime >= sysConfig.dosingPulseMs) {
                relayManager.setRelay(RELAY_NUTRIENT_B, false);
                _nutrientState = NUT_LOCKOUT;
                _nutrientLocked = true;
                _nutrientStepTime = now;
                LOG_INFO("EnvMgr: Nutrient B pulse complete. Lockout started (%lu ms)",
                         sysConfig.dosingLockoutMs);
            }
            break;

        case NUT_LOCKOUT:
            // Wait for solution to circulate and EC to stabilize
            if (now - _nutrientStepTime >= sysConfig.dosingLockoutMs) {
                _nutrientState = NUT_IDLE;
                _nutrientLocked = false;
                LOG_DEBUG("EnvMgr: Nutrient lockout expired. Ready for next dose.");
            }
            break;
    }
}

// ============================================================================
// LIGHTING — Schedule-based with MQTT override
// ============================================================================
void EnvironmentManager::handleLighting() {
    if (!sysConfig.lightingEnabled) return;

    bool shouldBeOn = false;

    if (_lightOverrideActive) {
        // MQTT manual override takes priority
        shouldBeOn = _lightOverrideState;
    } else {
        // Schedule-based: derive current hour from uptime
        // NOTE: For production, consider syncing with NTP for real wall-clock time.
        // This uses a simple modular approach based on millis() uptime.
        unsigned long uptimeSeconds = millis() / 1000;
        uint8_t currentHour = (uptimeSeconds / 3600) % 24;

        if (sysConfig.lightOnHour < sysConfig.lightOffHour) {
            // Normal case: e.g., ON=6, OFF=22
            shouldBeOn = (currentHour >= sysConfig.lightOnHour && currentHour < sysConfig.lightOffHour);
        } else {
            // Wrap-around case: e.g., ON=22, OFF=6 (overnight)
            shouldBeOn = (currentHour >= sysConfig.lightOnHour || currentHour < sysConfig.lightOffHour);
        }
    }

    if (shouldBeOn && !_lightOn) {
        relayManager.setRelay(RELAY_LIGHT, true);
        _lightOn = true;
        LOG_INFO("EnvMgr: Light ON");
    }
    else if (!shouldBeOn && _lightOn) {
        relayManager.setRelay(RELAY_LIGHT, false);
        _lightOn = false;
        LOG_INFO("EnvMgr: Light OFF");
    }
}

// ============================================================================
// PUBLIC HELPERS
// ============================================================================

void EnvironmentManager::setLightOverride(bool on) {
    _lightOverrideActive = true;
    _lightOverrideState = on;
    LOG_INFO("EnvMgr: Light override set to %s", on ? "ON" : "OFF");
}

void EnvironmentManager::clearLightOverride() {
    _lightOverrideActive = false;
    LOG_INFO("EnvMgr: Light override cleared — returning to schedule");
}

void EnvironmentManager::forceFanOff() {
    if (sysConfig.fanEnabled) {
        relayManager.setRelay(RELAY_FAN, false);
        _fanOn = false;
        sysConfig.fanAutoMode = false; // Disable automatic control until re-enabled
        LOG_INFO("EnvMgr: Fan forced OFF");
    }
}

void EnvironmentManager::forceFanOn() {
    if (sysConfig.fanEnabled) {
        relayManager.setRelay(RELAY_FAN, true);
        _fanOn = true;
        LOG_INFO("EnvMgr: Fan forced ON");
    }
}

void EnvironmentManager::allOff() {
    // Turn off all environment-controlled relays
    if (sysConfig.fanEnabled) {
        relayManager.setRelay(RELAY_FAN, false);
        _fanOn = false;
    }

    if (sysConfig.dosingEnabled) {
        relayManager.setRelay(RELAY_PH_UP, false);
        relayManager.setRelay(RELAY_PH_DOWN, false);
        _phDownActive = false;
        _phUpActive = false;
    }

    if (sysConfig.nutrientDosingEnabled) {
        relayManager.setRelay(RELAY_NUTRIENT_A, false);
        relayManager.setRelay(RELAY_NUTRIENT_B, false);
        _nutrientState = NUT_IDLE;
        _nutrientLocked = false;
    }

    if (sysConfig.lightingEnabled) {
        relayManager.setRelay(RELAY_LIGHT, false);
        _lightOn = false;
    }
}
