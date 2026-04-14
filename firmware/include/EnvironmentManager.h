/**
 * @file EnvironmentManager.h
 * @brief Environmental orchestration for non-irrigation actuators
 * 
 * Controls fans, pH dosing pumps, nutrient A/B dosing, and grow lights
 * based on sensor data. Each subsystem can be independently enabled/disabled
 * via sysConfig flags, so users without specific hardware can disable
 * those features without affecting the rest of the system.
 * 
 * All logic is non-blocking (millis()-based). No delay() calls.
 */

#ifndef ENVIRONMENT_MANAGER_H
#define ENVIRONMENT_MANAGER_H

#include <Arduino.h>
#include "config.h"
#include "RelayManager.h"

class EnvironmentManager {
public:
    EnvironmentManager();

    /**
     * @brief Initialize environment controller. Call once in setup().
     */
    void begin();

    /**
     * @brief Tick method — call from main loop().
     * Evaluates sensor data and actuates relays as needed.
     */
    void loop();

    /**
     * @brief Override grow light state from MQTT command.
     * @param on true = force ON, false = force OFF
     */
    void setLightOverride(bool on);

    /**
     * @brief Clear the MQTT override — return to schedule-based lighting.
     */
    void clearLightOverride();

    /** @brief Trigger an immediate nutrient dose cycle (both A and B). 
     * Used for manual dosing from MQTT command.
     */
    //void triggerNutrientDose();

    /** @brief Force the fan relay ON or OFF, overriding automatic control. 
     * Used for manual fan control from MQTT command.
     */
    void forceFanOn();
    void forceFanOff();

    /**
     * @brief Turn off all environment relays (fan, dosing, nutrient, light). 
     * Called during emergency shutdown or maintenance mode.
     */
    void allOff();

    // --- Status getters (for telemetry / MQTT publishing) ---
    bool isFanOn()   const { return _fanOn; }
    bool isLightOn() const { return _lightOn; }
    bool isDosingLocked()   const { return _dosingLocked; }
    bool isNutrientLocked() const { return _nutrientLocked; }

private:
    // --- Fan control ---
    bool _fanOn;
    void handleFanControl();

    // --- pH dosing ---
    bool _dosingLocked;
    unsigned long _lastDoseTime;
    bool _phDownActive;
    bool _phUpActive;
    unsigned long _doseStartTime;
    void handlePhDosing();

    // --- Nutrient A/B dosing ---
    enum NutrientState : uint8_t {
        NUT_IDLE,           // Waiting for EC reading
        NUT_DOSING_A,       // Nutrient A relay is pulsing
        NUT_DELAY_A_TO_B,   // Waiting between A and B pulses
        NUT_DOSING_B,       // Nutrient B relay is pulsing
        NUT_LOCKOUT         // Waiting for solution to mix & circulate
    };
    NutrientState _nutrientState;
    bool _nutrientLocked;
    unsigned long _nutrientStepTime;
    void handleNutrientDosing();

    // --- Lighting ---
    bool _lightOn;
    bool _lightOverrideActive;
    bool _lightOverrideState;
    void handleLighting();
};

extern EnvironmentManager envManager;

#endif // ENVIRONMENT_MANAGER_H

