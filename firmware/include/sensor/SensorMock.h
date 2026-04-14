#pragma once

#ifdef USE_MOCK_ENV_SENSOR

#include "IEnvSensor.h"
#include <Arduino.h>

class SensorMock : public IEnvSensor {
public:
    SensorMock();
    
    bool begin() override;
    bool read(float& temperature, float& humidity, float& pressure) override;
    
    bool hasHumidity() const override { return true; }
    bool hasPressure() const override { return true; }
    const char* getName() const override { return "MockEnv"; }
};

#endif // USE_MOCK_ENV_SENSOR
