#ifdef USE_DHT

#include "sensor/SensorDHT.h"

SensorDHT::SensorDHT(uint8_t pin, uint8_t type) : _dht(pin, type) {
}

bool SensorDHT::begin() {
    _dht.begin();
    
    // Give DHT time to stabilize, then do a test read
    delay(2000);
    float t = _dht.readTemperature();
    if (isnan(t)) {
        return false;
    }
    return true;
}

bool SensorDHT::read(float& temperature, float& humidity, float& pressure) {
    float t = _dht.readTemperature();
    float h = _dht.readHumidity();
    
    if (isnan(t) || isnan(h)) {
        return false;
    }
    
    temperature = t;
    humidity = h;
    // Pressure is unmodified as DHT provides none
    
    return true;
}

#endif // USE_DHT
