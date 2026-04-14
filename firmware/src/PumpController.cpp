/**
 * @file PumpController.cpp
 * @brief Implementation of main water pump control with safety checks
 */

#include "PumpController.h"

// Initialize the actual RTC memory locations here (once)
RTC_DATA_ATTR unsigned long rtcLastRunTime = 0;
RTC_DATA_ATTR unsigned long rtcTotalRuntime = 0;

extern SensorData sensorData;
extern SystemConfig sysConfig;
extern SystemStatus systemStatus;

// Initialize with the specific logical relay
PumpController::PumpController(RelayID assignedRelay)
    : state(PUMP_OFF),
      relayId(assignedRelay),
      startTime(0),
      duration(0),
      timedOperation(false) {
}

bool PumpController::begin() {
    LOG_INFO("Initializing pump controller (Relay ID: %d)...", relayId);
    
    deactivateRelay();  // Ensure pump is off at startup

    // BOOT LOGIC: 
    // If we just woke up, check if we were in cooldown when we went to sleep.
    // Since millis() is now 0, we can't compare it to the OLD rtcLastRunTime.
    // Instead, we treat a fresh boot as a "reset" of the cooldown timer, 
    // but keep the totalRuntime intact.
    if (esp_sleep_get_wakeup_cause() != ESP_SLEEP_WAKEUP_UNDEFINED) {
        LOG_INFO("Waking from sleep. Preserving Total Runtime: %lu ms", totalRuntime);
        lastRunTime = millis() - sysConfig.pumpCooldownTime;
    } else lastRunTime = millis();
    
    state = PUMP_COOLDOWN;
    
    LOG_INFO("Pump controller initialized (Relay ID: %d)", relayId);
    return true;
}

bool PumpController::turnOn(unsigned long durationMs) {
    if (!checkSafety()) {
        LOG_ERROR("Pump safety check failed");
        state = PUMP_ERROR;
        return false;
    }

    if (durationMs > 0) {
        // Timed operation
        if (durationMs < sysConfig.pumpMinOnTime) {
            LOG_WARN("Duration too short, using minimum: %d ms", sysConfig.pumpMinOnTime);
            durationMs = sysConfig.pumpMinOnTime;
        }
        
        if (durationMs > sysConfig.pumpMaxOnTime) {
            LOG_WARN("Duration too long, using maximum: %d ms", sysConfig.pumpMaxOnTime);
            durationMs = sysConfig.pumpMaxOnTime;
        }
        
        duration = durationMs;
        timedOperation = true;
    } else {
        // Manual operation
        duration = 0;
        timedOperation = false;
    }
    
    startTime = millis();
    activateRelay();
    state = PUMP_ON;
    
    LOG_INFO("Pump turned ON (duration: %s)", 
             timedOperation ? String(duration).c_str() : "manual");
    
    return true;
}

void PumpController::turnOff() {
    if (state != PUMP_ON) return;
    deactivateRelay();
    
    unsigned long runtime = millis() - startTime;
    totalRuntime += runtime;
    lastRunTime = millis();
    
    LOG_INFO("Pump turned OFF (runtime: %lu ms, total: %lu ms)", runtime, totalRuntime);
    // Enter cooldown
    state = PUMP_COOLDOWN;
}

void PumpController::loop() {
    switch (state) {
        case PUMP_ON:
            // Check if timed operation has completed
            if (timedOperation && (millis() - startTime >= duration)) {
                LOG_INFO("Pump timer expired");
                turnOff();
            }
            
            // Safety check during operation
            if (!checkSafety()) {
                LOG_ERROR("Pump safety violation during operation");
                emergencyStop();
            }
            break;
            
        case PUMP_COOLDOWN:
            // Check if cooldown period has elapsed
            if (millis() - lastRunTime >= sysConfig.pumpCooldownTime) {
                LOG_DEBUG("Pump cooldown complete");
                turnOn(sysConfig.pumpMaxOnTime);
            }
            break;
            
        case PUMP_ERROR:
            // Error state - manual intervention required
            if (checkSafety()) {
                LOG_DEBUG("Pump safety: error resolved. Pump has been set to cooldown");
                state = PUMP_COOLDOWN;
            }
            deactivateRelay();
            break;
            
        case PUMP_OFF:
        default:
            // Nothing to do
            break;
    }
}

void PumpController::emergencyStop() {
    LOG_ERROR("EMERGENCY PUMP STOP");
    deactivateRelay();
    state = PUMP_ERROR;
}

bool PumpController::canRun() const {
    return state == PUMP_OFF && checkSafety();
}

unsigned long PumpController::getTimeRemaining() const {
    if (state != PUMP_ON || !timedOperation) {
        return 0;
    }
    
    unsigned long elapsed = millis() - startTime;
    if (elapsed >= duration) {
        return 0;
    }
    
    return duration - elapsed;
}

// ============================================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================================

void PumpController::activateRelay() {
    if (USE_SHIFT_REGISTER) {
        // Ensure the relay is set to OFF in the shift register before activating
        relayManager.setRelay(relayId, true);
        LOG_VERBOSE("Relay activated (ID: %d)", relayId);
        delay(50); // Short delay to ensure state is registered
    }
    else {
        // If not using shift register, we can directly set the relay pin HIGH here
        digitalWrite(PIN_RELAY_PUMP1, HIGH);
        LOG_VERBOSE("Direct GPIO relay activated (Pin: %d)", PIN_RELAY_PUMP1);
    }
    //relayManager.setRelay(relayId, true);
    //LOG_VERBOSE("Relay activated (ID: %d)", relayId);
}

void PumpController::deactivateRelay() {
    if (USE_SHIFT_REGISTER) {
        relayManager.setRelay(relayId, false);
        LOG_VERBOSE("Relay deactivated (ID: %d)", relayId);
    }
    else {
        // If not using shift register, we can directly set the relay pin LOW here
        digitalWrite(PIN_RELAY_PUMP1, LOW);
        LOG_VERBOSE("Direct GPIO relay deactivated (Pin: %d)", PIN_RELAY_PUMP1);
    }
    //relayManager.setRelay(relayId, false);
    //LOG_VERBOSE("Relay deactivated (ID: %d)", relayId);
}

bool PumpController::checkSafety() const {
    // Basic hardware protections
    if (!checkHardwareSafety()) return false;
    
    // Environmental protections
    if (!checkEnvironmentalSafety()) return false;

    return true;
}

// Hardware protections (battery, water level, system state)
bool PumpController::checkHardwareSafety() const {
    // Don't run the pump if the user is performing maintenance
    if (systemStatus.state == STATE_MAINTENANCE) {
        LOG_WARN("Safety: Pump blocked - System in MAINTENANCE mode");
        return false;
    }
    if (sensorData.batteryVoltage < sysConfig.batteryCriticalThreshold) {
        LOG_ERROR("Safety: Battery too low for pump (%.2f V) < %.2f V ", sensorData.batteryVoltage, sysConfig.batteryCriticalThreshold);
        
        return false;
    }
    if (sensorData.waterLevel < 5.0) {
        LOG_ERROR("Safety: Water level too low (%.1f%%)", sensorData.waterLevel);
        return false;
    }
    return true;
}

// Environmental protections (temperature)
bool PumpController::checkEnvironmentalSafety() const {
    if (sensorData.waterTemp > sysConfig.emergencyShutdownTemp) {
        LOG_ERROR("Safety: Water temperature too high (%.1f C)", sensorData.waterTemp);
        return false;
    }
    return true; 
}