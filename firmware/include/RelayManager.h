/**
 * @file RelayManager.h
 * @brief Manages relay states via 74HC595 shift registers over SPI.
 */

#ifndef RELAY_MANAGER_H
#define RELAY_MANAGER_H

#include <Arduino.h>
#include "config.h"

class RelayManager {
public:
    RelayManager();

    /**
     * @brief Initializes the SPI bus and sets initial safe states.
     */
    void begin();

    /**
     * @brief Sets the logical state of a specific relay.
     * @param id The logical relay identifier.
     * @param state True for ON, False for OFF.
     */
    void setRelay(RelayID id, bool state);

    /**
     * @brief Retrieves the current logical state of a relay.
     */
    bool getRelayState(RelayID id) const;

    /**
     * @brief Immediately disables all relays (Safety/Emergency).
     */
    void allOff();

private:
    uint32_t logicalStateMask; // 1 = Logical ON, 0 = Logical OFF
    uint32_t activeLowMask;    // Hardware mapping (from config)
    
    void updateHardware();
};

extern RelayManager relayManager;

#endif // RELAY_MANAGER_H