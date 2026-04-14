#include "sensor/CompositeEnvSensor.h"

CompositeEnvSensor::CompositeEnvSensor(IEnvSensor* s1, IEnvSensor* s2) : _s1(s1), _s2(s2) {
}

bool CompositeEnvSensor::begin() {
    bool ok1 = true;
    bool ok2 = true;
    
    if (_s1) ok1 = _s1->begin();
    if (_s2) ok2 = _s2->begin();
    
    // As long as one active sensor begins successfully (or both are null, which shouldn't happen)
    return (_s1 ? ok1 : true) && (_s2 ? ok2 : true);
}

bool CompositeEnvSensor::read(float& temperature, float& humidity, float& pressure) {
    bool ok1 = false;
    bool ok2 = false;
    
    // We read both. If they overlap in what they read (e.g. both read temp), the second one overrides.
    // Usually one is DHT (temp/hum), one is BMP (temp/press). So BMP overrides DHT temp, which is fine or expected.
    if (_s1) ok1 = _s1->read(temperature, humidity, pressure);
    if (_s2) ok2 = _s2->read(temperature, humidity, pressure);
    
    return ok1 || ok2; // Success if at least one succeeds
}

bool CompositeEnvSensor::hasHumidity() const {
    return (_s1 && _s1->hasHumidity()) || (_s2 && _s2->hasHumidity());
}

bool CompositeEnvSensor::hasPressure() const {
    return (_s1 && _s1->hasPressure()) || (_s2 && _s2->hasPressure());
}
