/**
 * @file SensorManager.cpp
 * @brief Implementation of unified sensor management
 */

#include "SensorManager.h"
#include "sensor/SensorBME280.h"
#include "sensor/SensorDHT.h"
#include "sensor/SensorBMP280.h"
#include "sensor/CompositeEnvSensor.h"

SensorManager::SensorManager() 
    : oneWire(PIN_ONEWIRE),
      ds18b20(&oneWire),
      envSensor(nullptr),
      errorCount(0),
      lastReadTime(0),
      sensorsInitialized(false){
}

bool SensorManager::begin() {
    LOG_INFO("Initializing sensors...");
    
    tankType = DEFAULT_TANK_TYPE;
    tankDimA = DEFAULT_TANK_DIM_A;
    tankDimB = DEFAULT_TANK_DIM_B;
    tankFullH = DEFAULT_TANK_FULL_H;
    tankEmptyD = DEFAULT_TANK_EMPTY_D;
    
    bool success = true;
    Wire.setTimeout(1000); // 1 second timeout
    
    // Initialize DS18B20
    success &= initDS18B20();
    // Initialize Environmental Sensors
    initEnvSensors();
    // Initialize analog sensors
    initAnalogSensors(); //success &= initAnalogSensors();
    // Initialize ultrasonic
    initUltrasonic(); //success &= initUltrasonic();
    sensorsInitialized = success;
    
    if (success) {
        LOG_INFO("All sensors initialized successfully");
    } else {
        LOG_WARN("Some sensors failed to initialize");
    }
    
    return success;
}

bool SensorManager::initDS18B20() {
    LOG_DEBUG("Initializing DS18B20...");
    ds18b20.begin();
    
    uint8_t deviceCount = ds18b20.getDeviceCount();
    if (deviceCount == 0) {
        LOG_ERROR("No DS18B20 devices found on OneWire bus");
        return false;
    }
    
    LOG_INFO("Found %d DS18B20 device(s)", deviceCount);
    ds18b20.setResolution(DS18B20_RESOLUTION);
    ds18b20.setWaitForConversion(true);  // Async reading for efficiency
    
    return true;
}

bool SensorManager::initEnvSensors() {
    LOG_DEBUG("Initializing Environmental Sensors...");
    i2cBus.begin();

#if defined(USE_BME280)
    static SensorBME280 bme;
    envSensor = &bme;
#elif defined(USE_DHT) && defined(USE_BMP280)
    static SensorDHT dht(PIN_DHT, DHT_TYPE);
    static SensorBMP280 bmp;
    static CompositeEnvSensor comp(&dht, &bmp);
    envSensor = &comp;
#elif defined(USE_DHT)
    static SensorDHT dht(PIN_DHT, DHT_TYPE);
    envSensor = &dht;
#elif defined(USE_BMP280)
    static SensorBMP280 bmp;
    envSensor = &bmp;
/*#elif defined(USE_MOCK_ENV_SENSOR)
    static SensorMock mock;
    envSensor = &mock;*/
#else
    LOG_WARN("No environmental sensor defined in build flags!");
    return false;
#endif

    if (envSensor) {
        if (!envSensor->begin()) {
            LOG_ERROR("Environmental sensor init failed!");
            return false;
        }
        LOG_INFO("Environmental sensor initialized: %s", envSensor->getName());
        return true;
    }
    return false;
}

bool SensorManager::initAnalogSensors() {
    LOG_DEBUG("Initializing analog sensors...");
    // Configure ADC
    analogReadResolution(12);  // 12-bit resolution (0-4095)
    //analogSetAttenuation(ADC_11db);  // 0-3.3V range  
    analogSetPinAttenuation(PIN_WATER_LEVEL, ADC_11db);
    analogSetPinAttenuation(PIN_BATTERY_VOLTAGE, ADC_11db);
    analogSetPinAttenuation(PIN_PH_SENSOR, ADC_11db);
    analogSetPinAttenuation(PIN_EC_SENSOR, ADC_11db);

    // Test reads
    uint16_t waterLevelADC = analogRead(PIN_WATER_LEVEL);
    uint16_t battery = analogRead(PIN_BATTERY_VOLTAGE);
    delay(10);
    LOG_DEBUG("Water level ADC: %d, Battery ADC: %d", waterLevelADC, battery);
    //Serial.flush();
    LOG_INFO("Analog sensors initialized");
    
    return true;
}

bool SensorManager::initUltrasonic() {
    #if ULTRASONIC_SENSOR_TYPE == ULTRASONIC_A02YYUW
    LOG_DEBUG("Initializing A02YYUW (UART)...");
    Serial2.begin(9600, SERIAL_8N1, 16, 17); // RX=16, TX=17
    LOG_INFO("A02YYUW (UART) initialized on RX:16 TX:17");
    #elif ULTRASONIC_SENSOR_TYPE == ULTRASONIC_JSN_SR04T
    LOG_DEBUG("Initializing JSN-SR04T (Waterproof)...");
    #else
    LOG_DEBUG("Initializing HC-SR04...");
    #endif
    
    #if ULTRASONIC_SENSOR_TYPE != ULTRASONIC_A02YYUW
    pinMode(PIN_HC_SR04_TRIGGER, OUTPUT);
    pinMode(PIN_HC_SR04_ECHO, INPUT);
    
    digitalWrite(PIN_HC_SR04_TRIGGER, LOW);
    delayMicroseconds(5); // Stabilize
    #endif
    
    #if ULTRASONIC_SENSOR_TYPE == ULTRASONIC_JSN_SR04T
    LOG_INFO("JSN-SR04T initialized on Trig:%d Echo:%d", PIN_HC_SR04_TRIGGER, PIN_HC_SR04_ECHO);
    #elif ULTRASONIC_SENSOR_TYPE == ULTRASONIC_HC_SR04
    LOG_INFO("HC-SR04 initialized on Trig:%d Echo:%d", PIN_HC_SR04_TRIGGER, PIN_HC_SR04_ECHO);
    #endif
    return true;
}

bool SensorManager::readAll(SensorData &data) {
    if (!sensorsInitialized) {
        LOG_ERROR("Sensors not initialized");
        data.valid = false;
        return false;
    }
    
    LOG_DEBUG("Reading all sensors...");
    unsigned long startTime = millis();
    
    bool success = true;
    
    bool waterTempReadOk = readWaterTemperature(data.waterTemp);
    success &= waterTempReadOk;

    bool airReadOk = readAirConditions(data.airTemp, data.humidity, data.pressure);
    success &= airReadOk;
    // Read water level
    //success &= readWaterLevel(data.waterLevelADC);
    readWaterLevel(data.waterLevelADC); // Always read ADC, but we will validate it later and decide how to interpret it (percent or raw)

    // Read reservoir distance
    bool ultrasonicOk = readReservoirDistance(data.reservoirDistance);
    //readReservoirDistance(data.reservoirDistance); //success &= readReservoirDistance(data.reservoirDistance);
    // success &= ultrasonicOk

    // Read battery voltage
    success &= readBatteryVoltage(data.batteryVoltage);

    bool waterTempOk = waterTempReadOk && !isnan(data.waterTemp);
    bool phOk = readPH(data.pH);
    bool ecOk = readEC(data.ec, data.waterTemp);

    healthSnapshot.temperature.enabled = true;
    healthSnapshot.temperature.ok = waterTempOk;
    healthSnapshot.temperature.error = waterTempOk ? nullptr : "no_reading";

    healthSnapshot.air.enabled = (envSensor != nullptr);
    healthSnapshot.air.ok = healthSnapshot.air.enabled && airReadOk;
    healthSnapshot.air.error = healthSnapshot.air.ok ? nullptr : "no_reading";

    healthSnapshot.ultrasonic.enabled = true;
    healthSnapshot.ultrasonic.ok = ultrasonicOk;
    healthSnapshot.ultrasonic.error = ultrasonicOk ? nullptr : "no_reading";

    #ifdef PIN_PH_SENSOR
    healthSnapshot.ph.enabled = true;
    #else
    healthSnapshot.ph.enabled = false;
    #endif
    healthSnapshot.ph.ok = phOk;
    healthSnapshot.ph.error = phOk ? nullptr : "no_reading";

    #ifdef PIN_EC_SENSOR
    healthSnapshot.ec.enabled = true;
    #else
    healthSnapshot.ec.enabled = false;
    #endif
    healthSnapshot.ec.ok = ecOk;
    healthSnapshot.ec.error = ecOk ? nullptr : "no_reading";

    if (ultrasonicOk && data.reservoirDistance >= 0) {
        calculateTankMetrics(
            data.reservoirDistance,
            data.waterLevelLitres,
            data.waterLevelPercent
        );
        data.waterLevel = data.waterLevelPercent; // For backward compatibility, we can still populate waterLevel with percent if needed
    } else {
        // Mark as invalid but do NOT break the whole sensor cycle
        data.waterLevelLitres = NAN;
        data.waterLevelPercent = NAN;
        LOG_WARN("Ultrasonic invalid, skipping tank volume calculation");
        if (data.waterLevelADC > 0) {
            // We can still estimate level percent from ADC if ultrasonic failed
            const int ADC_EMPTY = 1000; // Example ADC value when reservoir is empty
            const int ADC_FULL = 3000;  // Example ADC value when reservoir is full
            float levelPercent = 0.0f; 
            if (data.waterLevelADC <= ADC_EMPTY) {
                levelPercent = 0.0f;
            } else if (data.waterLevelADC >= ADC_FULL) {
                levelPercent = 100.0f;
            } else {
                levelPercent = ((float)(data.waterLevelADC - ADC_EMPTY) / (ADC_FULL - ADC_EMPTY)) * 100.0f;
            }
            data.waterLevel = levelPercent;
            LOG_INFO("Estimated water level percent from ADC: %.2f%%", levelPercent);
        } else {
            LOG_WARN("No valid water level data available");
        }
    }
    //calculateTankMetrics(data.reservoirDistance, data.waterLevelLitres, data.waterLevelPercent);

    // Validation of environmental sensors is done inside readAirConditions

    data.timestamp = millis();
    data.valid = success;
    
    if (success) {
        errorCount = 0;
        lastReadTime = millis();
        LOG_DEBUG("All sensors read successfully in %lu ms", millis() - startTime);
    } else {
        errorCount++;
        LOG_WARN("Sensor read failed (error count: %d)", errorCount);
    }
    
    return success;
}

bool SensorManager::readWaterTemperature(float &temp) {
    ds18b20.requestTemperatures();
    delay(750); // Standard robust wait time for DS18B20
    // Wait for conversion (async)
    unsigned long start = millis();
    while (!ds18b20.isConversionComplete() && (millis() - start) < SENSOR_TIMEOUT_MS) {
        delay(10);
    }
    
    temp = ds18b20.getTempCByIndex(0);
    
    if (temp == DEVICE_DISCONNECTED_C || !validateReading(temp, WATER_TEMP_MIN, WATER_TEMP_MAX)) {
        LOG_ERROR("Invalid water temperature reading: %.2f", temp);
        temp = NAN;
        return false;
    }
    
    LOG_VERBOSE("Water temp: %.2f °C", temp);
    return true;
}

bool SensorManager::readAirConditions(float &temp, float &humidity, float &pressure) {
    if (!envSensor) return false;
    
    float t = NAN, h = NAN, p = NAN;
    
    if (!envSensor->read(t, h, p)) {
        LOG_ERROR("Environmental sensor (%s) read failed", envSensor->getName());
        return false;
    }
    
    // Assign values
    temp = t;
    humidity = h;
    pressure = p;
    
    bool valid = true;
    
    if (!isnan(temp) && !validateReading(temp, AIR_TEMP_MIN, AIR_TEMP_MAX)) {
        LOG_WARN("Invalid temp reading: %.2f", temp);
        valid = false;
    }
    
    if (envSensor->hasHumidity() && !isnan(humidity) && !validateReading(humidity, HUMIDITY_MIN, HUMIDITY_MAX)) {
        LOG_WARN("Invalid humidity reading: %.2f", humidity);
        valid = false;
    }
    
    if (envSensor->hasPressure() && !isnan(pressure) && !validateReading(pressure, PRESSURE_MIN, PRESSURE_MAX)) {
        LOG_WARN("Invalid pressure reading: %.2f", pressure);
        valid = false;
    }
    
    LOG_VERBOSE("Air: %.2f °C, %.2f %%, %.2f hPa", temp, humidity, pressure);
    return valid;
}

bool SensorManager::readWaterLevel(uint16_t &level) {
    level = readAnalogFiltered(PIN_WATER_LEVEL);
    
    LOG_VERBOSE("Water level ADC: %d", level);
    return true;  // Always valid, but check thresholds elsewhere
}

bool SensorManager::readReservoirDistance(float &distance) {
    distance = readUltrasonic();
    
    if (distance < 0 || distance > ULTRASONIC_MAX_DISTANCE) {
        LOG_ERROR("Invalid ultrasonic reading: %.2f cm", distance);
        distance = -1;
        return false;
    }
    else if (ULTRASONIC_SENSOR_TYPE == ULTRASONIC_JSN_SR04T && distance < 20) {
        LOG_WARN("JSN-SR04T reading out of range: %.2f cm", distance);
        return false;
    }
    
    LOG_VERBOSE("Reservoir distance: %.2f cm", distance);
    return true;
}

bool SensorManager::readBatteryVoltage(float &voltage) {
    uint16_t adcValue = readAnalogFiltered(PIN_BATTERY_VOLTAGE);
    voltage = mapBatteryVoltage(adcValue);
    
    LOG_VERBOSE("Battery: %.2f V (ADC: %d)", voltage, adcValue);
    return true;
}

// ============================================================================
// pH / EC (analog, conditioned 0–3.3 V at ESP32 ADC pin)
// ============================================================================

float SensorManager::adcPinToVoltage(uint16_t adcRaw) const {
    const float ADC_MAX = 4095.0f;
    const float VREF = 3.3f;
    return (static_cast<float>(adcRaw) / ADC_MAX) * VREF;
}

bool SensorManager::readPH(float &ph) {
    #ifdef PIN_PH_SENSOR
        uint16_t raw = readAnalogFiltered(PIN_PH_SENSOR);
        float V = adcPinToVoltage(raw);
        ph = sysConfig.phSlope * V + sysConfig.phOffset;
        if (!validateReading(ph, PH_MIN, PH_MAX)) {
            LOG_WARN("pH out of range: %.2f (%.3f V)", ph, V);
            ph = NAN;
            return false;
        }
        LOG_VERBOSE("pH: %.2f (%.3f V)", ph, V);
        return true;
    #else
        ph = 7.0f;
        LOG_DEBUG("pH sensor not configured");
        return false;
    #endif
}

bool SensorManager::readEC(float &ec, float waterTempC) {
    #ifdef PIN_EC_SENSOR
        uint16_t raw = readAnalogFiltered(PIN_EC_SENSOR);
        float V = adcPinToVoltage(raw);
        float dv = V - sysConfig.ecDryVoltage;
        if (dv < 0.0f) {
            dv = 0.0f;
        }
        float ecMeas = dv * sysConfig.ecScale;
        if (!isnan(waterTempC) && waterTempC > -40.0f && waterTempC < 80.0f) {
            float denom = 1.0f + EC_TEMP_COEFF * (waterTempC - 25.0f);
            if (fabsf(denom) > 1e-6f) {
                ecMeas = ecMeas / denom;
            }
        }
        ec = ecMeas;
        if (!validateReading(ec, EC_MIN, EC_MAX)) {
            LOG_WARN("EC out of range: %.3f mS/cm (%.3f V)", ec, V);
            ec = NAN;
            return false;
        }
        LOG_VERBOSE("EC: %.3f mS/cm (%.3f V)", ec, V);
        return true;
    #else
        ec = 1.5f;
        LOG_DEBUG("EC sensor not configured");
        return false;
    #endif
}

float SensorManager::samplePhVoltage() {
    #ifdef PIN_PH_SENSOR
        return adcPinToVoltage(readAnalogFiltered(PIN_PH_SENSOR, 32));
    #else
        return NAN;
    #endif
}

float SensorManager::sampleEcVoltage() {
    #ifdef PIN_EC_SENSOR
        return adcPinToVoltage(readAnalogFiltered(PIN_EC_SENSOR, 32));
    #else
        return NAN;
    #endif
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

float SensorManager::readUltrasonic() {
    #if ULTRASONIC_SENSOR_TYPE == ULTRASONIC_A02YYUW
        uint8_t data[4];
        unsigned long start = millis();
        
        // Wait for header byte 0xFF
        while (Serial2.available() > 0 && Serial2.peek() != 0xFF) {
            Serial2.read();
        }
        
        if (Serial2.available() >= 4) {
            for (int i = 0; i < 4; i++) {
                data[i] = Serial2.read();
            }
            
            // Verify checksum
            uint8_t sum = (data[0] + data[1] + data[2]) & 0xFF;
            if (sum == data[3]) {
                uint16_t distance_mm = (data[1] << 8) | data[2];
                return (float)distance_mm / 10.0; // mm to cm
            } else {
                LOG_WARN("A02YYUW Checksum mismatch");
                return -1;
            }
        }
        
        // If we get here, either no data or invalid packet
        if (millis() - start > 100) return -1; // Fast timeout
        return -1;

    #else
        // Trigger pulse
        digitalWrite(PIN_HC_SR04_TRIGGER, LOW);
        delayMicroseconds(2);
        digitalWrite(PIN_HC_SR04_TRIGGER, HIGH);
        delayMicroseconds(ULTRASONIC_TRIGGER_PULSE_US); 
        digitalWrite(PIN_HC_SR04_TRIGGER, LOW);
        
        // Measure echo pulse width
        unsigned long duration = pulseIn(PIN_HC_SR04_ECHO, HIGH, ULTRASONIC_TIMEOUT);
        
        if (duration == 0) {
            return -1;  // Timeout or no reading
        }
        
        // Calculate distance in cm (speed of sound = 343 m/s = 0.0343 cm/us)
        float distance = duration * 0.0343 / 2.0;
        
        return distance;
    #endif
}

uint16_t SensorManager::readAnalogFiltered(uint8_t pin, uint8_t samples) {
    uint32_t sum = 0;
    
    for (uint8_t i = 0; i < samples; i++) {
        sum += analogRead(pin);
        delayMicroseconds(500); // Small delay allows the sample-and-hold capacitor to recharge
    }
    
    return sum / samples;
}

float SensorManager::mapBatteryVoltage(uint16_t adcValue) {
    // Assuming voltage divider: Vbat --[R1]--+--[R2]-- GND
    //                                        |
    //                                       ADC
    // Example: R1=10k, R2=10k => Vbat = ADC * 2
    // Adjust for your specific voltage divider
    
    const float ADC_MAX = 4095.0;
    const float VREF = 3.3;
    //const float VOLTAGE_DIVIDER_RATIO = 2.0;  // Adjust based on your resistors
    const float VOLTAGE_DIVIDER_RATIO = (VOLTAGE_DIVIDER_R1 + VOLTAGE_DIVIDER_R2) / VOLTAGE_DIVIDER_R2;
    float adcVoltage = (adcValue / ADC_MAX) * VREF;
    float voltage = adcVoltage * VOLTAGE_DIVIDER_RATIO;
    LOG_VERBOSE("Battery: %.2f V (VOLTAGE_DIVIDER_RATIO: %.2f)", voltage, VOLTAGE_DIVIDER_RATIO);
    return voltage;
}

bool SensorManager::validateReading(float value, float min, float max) {
    return !isnan(value) && value >= min && value <= max;
}


void SensorManager::calculateTankMetrics(
    float rawDistance,
    float &litres,
    float &percent
) {
    if (rawDistance < 0) {
        litres = NAN;
        percent = NAN;
        return;
    }

    // h = D - d
    float waterHeight = tankEmptyD - rawDistance;

    // Clamp
    if (waterHeight < 0) waterHeight = 0;
    if (waterHeight > tankFullH) waterHeight = tankFullH;

    float volumeCm3 = 0;

    if (tankType == RECTANGULAR) {
        volumeCm3 = tankDimA * tankDimB * waterHeight;
    }
    else if (tankType == CYLINDRICAL) {
        volumeCm3 = PI * tankDimA * tankDimA * waterHeight;
    }
    else {
        LOG_ERROR("Unsupported tank type: %d", tankType);
        litres = NAN;
        percent = NAN;
        return;
    }

    litres = volumeCm3 / 1000.0;
    percent = (waterHeight / tankFullH) * 100.0;
}

bool SensorManager::calibrateTankEmpty() {
    float d;

    if (!readReservoirDistance(d) || d < 0) {
        LOG_ERROR("Ultrasonic read failed during calibration");
        return false;
    }

    tankEmptyD = d;
    sysConfig.tankEmptyD = tankEmptyD; // Save to config for persistence
    LOG_INFO("Tank empty distance set to %.2f cm", tankEmptyD);
    return true;
}


void SensorManager::setTankType(TankShape type) {
    tankType = type;
}

void SensorManager::setTankDimensions(float a, float b, float fullH) {
    tankDimA = a;
    tankDimB = b;
    tankFullH = fullH;
}

void SensorManager::setTankEmptyDistance(float d) {
    tankEmptyD = d;
}


void SensorManager::updateTankConfig(uint8_t type, float a, float b, float H, float D) {
    tankType = (TankShape)type;
    tankDimA = a;
    tankDimB = b;
    tankFullH = H;

    if (!isnan(D)) {
        tankEmptyD = D;
    }

    LOG_INFO("Tank config updated: type=%d A=%.1f B=%.1f H=%.1f D=%.1f", tankType, tankDimA, tankDimB, tankFullH, tankEmptyD);
}

/*void SensorManager::calculateTankVolume(float distance, float &litres, float &percent) {
    if (distance <= 0 || distance > TANK_HEIGHT_CM) {
        litres = 0;
        percent = 0;
        return;
    }

    // 1. Calculate the actual water height (h = D - d)
    float waterHeight = TANK_HEIGHT_CM - distance;
    
    // 2. Calculate Volume in cm3
    float volumeCm3 = 0;
    if (TANK_TYPE == RECTANGULAR) {
        // V = L * W * h
        volumeCm3 = TANK_DIM_A * TANK_DIM_B * waterHeight;

    } else if (TANK_TYPE == CYLINDRICAL) {
        // Cylinder: V = pi * r^2 * h
        volumeCm3 = PI * pow(TANK_DIM_A, 2) * waterHeight;

    } else {
        // Unsupported tank type
        LOG_ERROR("Unsupported tank type: %d. Only RECTANGULAR and CYLINDRICAL are supported.", TANK_TYPE);
        volumeCm3 = 0;   // Safe fallback
    }

    // 3. Convert cm3 to Litres (1000 cm3 = 1 L)
    litres = volumeCm3 / 1000.0;

    // 4. Calculate Percentage
    percent = (waterHeight / TANK_HEIGHT_CM) * 100.0;
}*/