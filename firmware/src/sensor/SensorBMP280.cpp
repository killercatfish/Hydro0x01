#ifdef USE_BMP280

#include "sensor/SensorBMP280.h"

SensorBMP280::SensorBMP280(uint8_t address) : _address(address) {
}

bool SensorBMP280::begin() {
    if (!_bmp.begin(_address)) {
        if (!_bmp.begin(0x77)) {
            return false;
        }
    }
    
    _bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                     Adafruit_BMP280::SAMPLING_X2,   // Temp
                     Adafruit_BMP280::SAMPLING_X16,  // Pressure
                     Adafruit_BMP280::FILTER_X16,
                     Adafruit_BMP280::STANDBY_MS_500);
                     
    return true;
}

bool SensorBMP280::read(float& temperature, float& humidity, float& pressure) {
    float t = _bmp.readTemperature();
    float p = _bmp.readPressure() / 100.0F; // Pa to hPa

    if (isnan(t) || isnan(p)) {
        return false;
    }
    
    temperature = t;
    pressure = p;
    // Humidity is unmodified as BMP280 provides none
    
    return true;
}

#endif // USE_BMP280
