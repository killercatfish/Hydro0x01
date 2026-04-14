#pragma once

#include "IEnvSensor.h"
#include <Arduino.h>

class CompositeEnvSensor : public IEnvSensor {
public:
    CompositeEnvSensor(IEnvSensor* s1, IEnvSensor* s2);
    
    bool begin() override;
    bool read(float& temperature, float& humidity, float& pressure) override;
    
    bool hasHumidity() const override;
    bool hasPressure() const override;
    const char* getName() const override { return "Composite"; }

private:
    IEnvSensor* _s1;
    IEnvSensor* _s2;
};
