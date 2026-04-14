#include "sensor/I2CBusManager.h"
#include <Wire.h>

#ifdef USE_I2C_MULTIPLEXER
// Default I2C address for TCA9548A
#ifndef TCAADDR
#define TCAADDR 0x70
#endif
#endif

I2CBusManager::I2CBusManager() {
}

bool I2CBusManager::begin() {
    Wire.begin();
    return true;
}

bool I2CBusManager::selectChannel(uint8_t channel) {
#ifdef USE_I2C_MULTIPLEXER
    if (channel > 7) return false;
    
    Wire.beginTransmission(TCAADDR);
    Wire.write(1 << channel);
    Wire.endTransmission();
    return true; // Assume success for simplicity and embedded constraints
#else
    (void)channel; // Suppress unused parameter warning
    return true;
#endif
}
