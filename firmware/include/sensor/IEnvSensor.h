#pragma once

class IEnvSensor {
public:
    virtual bool begin() = 0;
    
    /**
     * @brief Read data from the sensor.
     * @param temperature Output parameter for temperature (C)
     * @param humidity Output parameter for relative humidity (%)
     * @param pressure Output parameter for atmospheric pressure (hPa)
     * @return true if reading was successful, false otherwise
     */
    virtual bool read(float& temperature, float& humidity, float& pressure) = 0;
    
    virtual bool hasHumidity() const = 0;
    virtual bool hasPressure() const = 0;
    virtual const char* getName() const = 0;
    virtual ~IEnvSensor() {}
};
