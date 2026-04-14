#pragma once

#ifdef USE_BMP280

#include "IEnvSensor.h"
#include <Adafruit_BMP280.h>

class SensorBMP280 : public IEnvSensor {
public:
    SensorBMP280(uint8_t address = 0x76);
    
    bool begin() override;
    bool read(float& temperature, float& humidity, float& pressure) override;
    
    bool hasHumidity() const override { return false; }
    bool hasPressure() const override { return true; }
    const char* getName() const override { return "BMP280"; }

private:
    uint8_t _address;
    Adafruit_BMP280 _bmp;
};

#endif // USE_BMP280
