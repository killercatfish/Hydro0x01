#pragma once

#include <Arduino.h>

class I2CBusManager {
public:
    I2CBusManager();
    
    /**
     * @brief Initialize I2C Bus and Multiplexer (if enabled)
     */
    bool begin();
    
    /**
     * @brief Select I2C channel if multiplexer is used, otherwise no-op.
     * @param channel 0-7 Multiplexer channel
     */
    bool selectChannel(uint8_t channel);
};
