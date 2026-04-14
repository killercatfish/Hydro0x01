#pragma once

#ifdef USE_DHT

#include "IEnvSensor.h"
#include <DHT.h>

class SensorDHT : public IEnvSensor {
public:
    SensorDHT(uint8_t pin, uint8_t type);
    
    bool begin() override;
    bool read(float& temperature, float& humidity, float& pressure) override;
    
    bool hasHumidity() const override { return true; }
    bool hasPressure() const override { return false; }
    const char* getName() const override { return "DHT"; }

private:
    DHT _dht;
};

#endif // USE_DHT
