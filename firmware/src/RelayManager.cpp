/**
 * @file RelayManager.cpp
 * @brief Implementation of the RelayManager.
 */

#include "RelayManager.h"

// Global instance
RelayManager relayManager;

RelayManager::RelayManager() : logicalStateMask(0) {
    activeLowMask = RELAY_ACTIVE_LOW_MASK;
}

void RelayManager::begin() {
    pinMode(PIN_SR_LATCH, OUTPUT);
    digitalWrite(PIN_SR_LATCH, HIGH);
    pinMode(PIN_SR_CLOCK, OUTPUT);
    digitalWrite(PIN_SR_CLOCK, LOW);
    pinMode(PIN_SR_DATA, OUTPUT);
    digitalWrite(PIN_SR_DATA, LOW);

    // Optional: Hardware Output Enable control to prevent boot glitches
    #ifdef PIN_SR_OE
    pinMode(PIN_SR_OE, OUTPUT);
    digitalWrite(PIN_SR_OE, HIGH); // Disable outputs during setup
    #endif
    
    // Set all logical relays to OFF before enabling outputs
    allOff();

    #ifdef PIN_SR_OE
    digitalWrite(PIN_SR_OE, LOW); // Enable outputs
    #endif
}

void RelayManager::setRelay(RelayID id, bool state) {
    if (!USE_SHIFT_REGISTER) {
        // If not using shift register, we can directly control the relay pin here
        // This is a simplified example assuming only one relay (Main Pump)
        if (id == RELAY_MAIN_PUMP) {
            digitalWrite(MAIN_PUMP_RELAY, state ? HIGH : LOW);
            LOG_VERBOSE("Direct GPIO relay set to %s (Pin: %d)", state ? "ON" : "OFF", MAIN_PUMP_RELAY);
            return;
        } 
        else if (id == RELAY_PH_UP) {
            digitalWrite(PIN_RELAY_PUMP1, state ? HIGH : LOW); // Example: pH Up shares the same pin for testing
            LOG_VERBOSE("Direct GPIO relay set to %s (Pin: %d)", state ? "ON" : "OFF", PIN_RELAY_PUMP1);
            return;
        }
        else if (id == RELAY_PH_DOWN) {
            digitalWrite(PIN_RELAY_PUMP2, state ? HIGH : LOW); // Example: pH Down shares the same pin for testing
            LOG_VERBOSE("Direct GPIO relay set to %s (Pin: %d)", state ? "ON" : "OFF", PIN_RELAY_PUMP2);
            return;
        }
        else if (id == RELAY_NUTRIENT_A) {
            digitalWrite(PIN_RELAY_PUMP3, state ? HIGH : LOW); // Example: Nutrient A shares the same pin for testing
            LOG_VERBOSE("Direct GPIO relay set to %s (Pin: %d)", state ? "ON" : "OFF", PIN_RELAY_PUMP3);
            return;
        }
        else if (id == RELAY_NUTRIENT_B) {
            digitalWrite(PIN_RELAY_PUMP4, state ? HIGH : LOW); // Example: Nutrient B shares the same pin for testing
            LOG_VERBOSE("Direct GPIO relay set to %s (Pin: %d)", state ? "ON" : "OFF", PIN_RELAY_PUMP4);
            return;
        }
        else if (id == RELAY_FAN) {
            digitalWrite(PIN_RELAY_FAN, state ? HIGH : LOW); // Example: Fan shares the same pin for testing
            LOG_VERBOSE("Direct GPIO relay set to %s (Pin: %d)", state ? "ON" : "OFF", PIN_RELAY_FAN);
            return;
        }
        else if (id == RELAY_LIGHT) {
            digitalWrite(PIN_RELAY_LIGHT, state ? HIGH : LOW); // Example: Light shares the same pin for testing
            LOG_VERBOSE("Direct GPIO relay set to %s (Pin: %d)", state ? "ON" : "OFF", PIN_RELAY_LIGHT);
            return;
        }
        else {
            LOG_ERROR("Invalid Relay ID %d for direct GPIO mode", id);
            return;
        }
    }
    else if (state) {
        logicalStateMask |= (1UL << id);
    } else {
        logicalStateMask &= ~(1UL << id);
    }
    updateHardware();
}

bool RelayManager::getRelayState(RelayID id) const {
    return (logicalStateMask & (1UL << id)) != 0;
}

void RelayManager::allOff() {
    if (!USE_SHIFT_REGISTER) {
        // If not using shift register, we can directly set all relay pins LOW here
        digitalWrite(MAIN_PUMP_RELAY, LOW);
        digitalWrite(PIN_RELAY_PUMP1, LOW);
        digitalWrite(PIN_RELAY_PUMP2, LOW);
        digitalWrite(PIN_RELAY_PUMP3, LOW);
        digitalWrite(PIN_RELAY_PUMP4, LOW);
        digitalWrite(PIN_RELAY_LIGHT, LOW);
        digitalWrite(PIN_RELAY_FAN, LOW);
        LOG_INFO("All relays turned OFF (Direct GPIO mode)");
        return;
    }
    logicalStateMask = 0;
    updateHardware();
}

void RelayManager::updateHardware() {
    // XOR the logical state with the active low mask.
    // If a relay is Active Low, its bit in the physical mask is flipped.
    uint32_t physicalState = logicalStateMask ^ activeLowMask;

    digitalWrite(PIN_SR_LATCH, LOW);
    
    // Transfer 4 bytes (supports up to 32 relays / 4 shift registers).
    // The 74HC595 shifts data through, so the first byte sent ends up 
    // at the very last shift register in the chain.
    shiftOut(PIN_SR_DATA, PIN_SR_CLOCK, MSBFIRST, (physicalState >> 24) & 0xFF);
    shiftOut(PIN_SR_DATA, PIN_SR_CLOCK, MSBFIRST, (physicalState >> 16) & 0xFF);
    shiftOut(PIN_SR_DATA, PIN_SR_CLOCK, MSBFIRST, (physicalState >> 8) & 0xFF);
    shiftOut(PIN_SR_DATA, PIN_SR_CLOCK, MSBFIRST, physicalState & 0xFF);

    digitalWrite(PIN_SR_LATCH, HIGH);
}