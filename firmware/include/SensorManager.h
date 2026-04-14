/**
 * @file SensorManager.h
 * @brief Unified sensor reading and management
 * 
 * Handles all sensor initialization, reading, and validation.
 * Provides clean abstraction for sensor data acquisition.
 */

#ifndef SENSOR_MANAGER_H
#define SENSOR_MANAGER_H

#include <Arduino.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "sensor/IEnvSensor.h"
#include "sensor/I2CBusManager.h"
#include "config.h"

/** Last-cycle health for MQTT /sensors/status (updated in readAll). */
struct SensorHealthEntry {
    bool enabled = false;
    bool ok = false;
    const char* error = nullptr;
};

struct SensorHealthSnapshot {
    SensorHealthEntry ultrasonic;
    SensorHealthEntry ph;
    SensorHealthEntry ec;
    SensorHealthEntry temperature;
    SensorHealthEntry air;
};

class SensorManager {
public:
    SensorManager();
    
    /**
     * @brief Initialize all sensors
     * @return true if all critical sensors initialized successfully
     */
    bool begin();
    
    /**
     * @brief Read all sensors and populate data structure
     * @param data Reference to SensorData structure to populate
     * @return true if reading successful
     */
    bool readAll(SensorData &data);
    
    /**
     * @brief Read specific sensor groups
     */
    bool readWaterTemperature(float &temp);
    bool readAirConditions(float &temp, float &humidity, float &pressure);
    bool readWaterLevel(uint16_t &level);
    bool readReservoirDistance(float &distance);
    bool readBatteryVoltage(float &voltage);
    
    bool readPH(float &ph);
    /** @param waterTempC water temperature (°C) for EC temperature compensation; use NAN to skip */
    bool readEC(float &ec, float waterTempC);

    /** Filtered ADC pin voltage (0–3.3 V) for calibration commands */
    float samplePhVoltage();
    float sampleEcVoltage();

    SensorHealthSnapshot getSensorHealthSnapshot() const { return healthSnapshot; }
    
    /**
     * @brief Validate sensor readings against expected ranges
     */
    bool validateReading(float value, float min, float max);

    /*void calculateTankVolume(float distance, float &litres, float &percent);*/

    /**
     * @brief Get sensor health status
     */
    bool isHealthy() const { return errorCount < MAX_CONSECUTIVE_ERRORS; }
    uint8_t getErrorCount() const { return errorCount; }
    void resetErrorCount() { errorCount = 0; }
    
    /**
     * @brief Get last successful read timestamp
     */
    unsigned long getLastReadTime() const { return lastReadTime; }

    // === Tank configuration setters ===
    void calculateTankMetrics(float rawDistance, float &litres, float &percent);

    void setTankType(TankShape type);
    void setTankDimensions(float a, float b, float fullH);
    void setTankEmptyDistance(float d);

    bool calibrateTankEmpty(); // auto D calibration
    void updateTankConfig(uint8_t type, float a, float b, float H, float D = NAN);


private:
    // Sensor objects
    OneWire oneWire;
    DallasTemperature ds18b20;
    
    IEnvSensor* envSensor;
    I2CBusManager i2cBus;
    
    // State tracking
    uint8_t errorCount;
    unsigned long lastReadTime;
    bool sensorsInitialized;
    
    // Helper functions
    float readUltrasonic();
    uint16_t readAnalogFiltered(uint8_t pin, uint8_t samples = 10);
    float mapBatteryVoltage(uint16_t adcValue);
    float adcPinToVoltage(uint16_t adcRaw) const;

    SensorHealthSnapshot healthSnapshot;
    
    // Sensor-specific initialization
    bool initDS18B20();
    bool initEnvSensors();
    bool initAnalogSensors();
    bool initUltrasonic();

    /*uint8_t tankType;
    float tankDimA;
    float tankDimB;
    float tankEmptyD;   // D
    float tankFullH;    // H*/
    // === Tank config ===
    TankShape tankType;
    float tankDimA;
    float tankDimB;
    float tankFullH;
    float tankEmptyD;
};

#endif // SENSOR_MANAGER_H