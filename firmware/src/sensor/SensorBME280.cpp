#ifdef USE_BME280

#include "sensor/SensorBME280.h"

SensorBME280::SensorBME280(uint8_t address) : _address(address) {
}

bool SensorBME280::begin() {
    if (!_bme.begin(_address)) {
        if (!_bme.begin(0x77)) { // Fallback alternative address
            return false;
        }
    }
    
    // Configure BME280 for accurate readings
    _bme.setSampling(Adafruit_BME280::MODE_NORMAL,
                     Adafruit_BME280::SAMPLING_X2,   // Temperature
                     Adafruit_BME280::SAMPLING_X16,  // Pressure
                     Adafruit_BME280::SAMPLING_X1,   // Humidity
                     Adafruit_BME280::FILTER_X16,
                     Adafruit_BME280::STANDBY_MS_500);
                     
    return true;
}

bool SensorBME280::read(float& temperature, float& humidity, float& pressure) {
    temperature = _bme.readTemperature();
    humidity = _bme.readHumidity();
    pressure = _bme.readPressure() / 100.0F; // Pa to hPa

    if (isnan(temperature) || isnan(humidity) || isnan(pressure)) {
        return false;
    }
    
    return true;
}

#endif // USE_BME280
