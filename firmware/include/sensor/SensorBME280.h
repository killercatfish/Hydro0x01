#pragma once

#ifdef USE_BME280

#include "IEnvSensor.h"
#include <Adafruit_BME280.h>

class SensorBME280 : public IEnvSensor {
public:
    SensorBME280(uint8_t address = 0x76);
    
    bool begin() override;
    bool read(float& temperature, float& humidity, float& pressure) override;
    
    bool hasHumidity() const override { return true; }
    bool hasPressure() const override { return true; }
    const char* getName() const override { return "BME280"; }

private:
    uint8_t _address;
    Adafruit_BME280 _bme;
};

#endif // USE_BME280
