/**
 * @file PumpController.h
 * @brief Water pump control and safety management
 * 
 * Controls ONLY the main water pump via RelayManager.
 * Handles pump operation with safety limits, cooldowns, and timed runs.
 */

#ifndef PUMP_CONTROLLER_H
#define PUMP_CONTROLLER_H

#include <Arduino.h>
#include "config.h"
#include "RelayManager.h"

// Variables with this attribute stay alive during Deep Sleep
extern RTC_DATA_ATTR unsigned long rtcLastRunTime;
extern RTC_DATA_ATTR unsigned long rtcTotalRuntime;

class PumpController {
public:
    PumpController(RelayID assignedRelay);
    
    /**
     * @brief Initialize pump control
     */
    bool begin();
    
    /**
     * @brief Turn pump on
     * @param duration Duration in milliseconds (0 = manual control)
     * @return true if pump started successfully
     */
    bool turnOn(unsigned long duration = 0);
    
    /**
     * @brief Turn pump off
     */
    void turnOff();
    
    /**
     * @brief Check if pump is running
     */
    bool isRunning() const { return state == PUMP_ON; }
    
    /**
     * @brief Get pump state
     */
    PumpState getState() const { return state; }
    
    /**
     * @brief Update pump (call in loop to handle timers)
     */
    void loop();
    
    /**
     * @brief Emergency stop
     */
    void emergencyStop();
    
    /**
     * @brief Check if pump can run
     */
    bool canRun() const;
    
    /**
     * @brief Get time remaining in current operation
     */
    unsigned long getTimeRemaining() const;
    
    /**
     * @brief Get total pump runtime
     */
    unsigned long getTotalRuntime() const { return totalRuntime; }
    
    /**
     * @brief Reset runtime counter
     */
    void resetRuntime() { totalRuntime = 0; }

private:
    RelayID relayId;

    PumpState state;
    unsigned long startTime;
    unsigned long duration;
    unsigned long& lastRunTime = rtcLastRunTime;     // Reference the RTC variable
    unsigned long& totalRuntime = rtcTotalRuntime;   // Reference the RTC variable
    bool timedOperation;
    
    void activateRelay();
    void deactivateRelay();
    bool checkSafety() const;

    bool checkHardwareSafety() const;
    bool checkEnvironmentalSafety() const;
};

#endif // PUMP_CONTROLLER_H